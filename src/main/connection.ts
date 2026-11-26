// Connection setup shared by terminal (ssh.ts) and file transfer (sftp.ts) sessions:
// jump hosts, host key checks and keyboard-interactive (2FA) prompts.
import { Client, type ClientChannel, type ConnectConfig, type HostVerifier } from 'ssh2'
import { createHash } from 'node:crypto'
import type { Host, PromptQuestion, Settings } from '../shared/types'
import type { Prompter } from './prompts'
import type { Secrets, Store, StoredHost } from './store'

// Time for the SSH handshake and login, not counting time spent in a dialog.
const READY_TIMEOUT_MS = 20_000
const MAX_JUMPS = 8

export function fingerprint(key: Buffer): string {
  return 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
}

// Host keys arrive in SSH wire format: a length-prefixed type name comes first.
function keyType(key: Buffer): string {
  if (key.length < 4) return 'unknown'
  const len = key.readUInt32BE(0)
  return key.subarray(4, 4 + len).toString('ascii') || 'unknown'
}

export function knownHostKey(host: Pick<Host, 'hostname' | 'port'>): string {
  return `${host.hostname}:${host.port}`
}

export function hostLabel(host: Pick<Host, 'label' | 'hostname'>): string {
  return host.label || host.hostname
}

export function connectConfig(
  host: Pick<Host, 'hostname' | 'port' | 'username' | 'auth'>,
  secrets: Secrets,
  settings: Settings,
  hostVerifier: HostVerifier
): ConnectConfig {
  const config: ConnectConfig = {
    host: host.hostname,
    port: host.port,
    username: host.username,
    // dial() runs its own timer, paused while the user answers a prompt.
    readyTimeout: 0,
    keepaliveInterval: Math.max(5, settings.keepAliveInterval) * 1000,
    keepaliveCountMax: 3,
    tryKeyboard: true,
    hostVerifier
  }
  if (host.auth === 'password') {
    if (secrets.password) config.password = secrets.password
  } else if (host.auth === 'key') {
    if (secrets.privateKey) config.privateKey = secrets.privateKey
    if (secrets.passphrase) config.passphrase = secrets.passphrase
    if (secrets.password) config.password = secrets.password
  } else {
    const agent =
      process.platform === 'win32'
        ? process.env.SSH_AUTH_SOCK || '\\\\.\\pipe\\openssh-ssh-agent'
        : process.env.SSH_AUTH_SOCK
    if (agent) config.agent = agent
  }
  return config
}

/** Why a connection closed before or after it was ready. */
export type Failure =
  | { code: 'hostkey'; message: string; knownKey: string; fingerprint: string }
  | { code: 'auth'; message: string }
  | { code?: undefined; message: string }

export interface DialContext {
  store: Store
  prompter: Prompter
  tabId: string
  // Progress line for the terminal (not used by SFTP).
  info?: (text: string, kind: 'info' | 'warn') => void
}

export interface Dialed {
  client: Client
  // Last reason for an error; read it in the client's 'close' handler.
  failure: () => Failure | null
}

/**
 * Starts connecting to `host`, through its jump host chain if it has one.
 * The returned client always ends with a 'close' event (unless .end() is called first),
 * so callers handle every outcome there, using failure() for the reason.
 */
export function dial(ctx: DialContext, host: StoredHost, via: string[] = []): Dialed {
  const client = new Client()
  const label = hostLabel(host)
  const knownKey = knownHostKey(host)
  const secrets = ctx.store.getSecrets(host.id)

  let failure: Failure | null = null
  // A failure we decided on (canceled prompt, changed key…) wins over the
  // generic error ssh2 reports right after it.
  let decided = false
  const fail = (f: Failure, decisive = true): void => {
    if (decided) return
    failure = f
    decided = decisive
  }

  let done = false
  let started = false
  const cleanups: (() => void)[] = []
  const cleanup = (): void => {
    if (done) return
    done = true
    for (const fn of cleanups.splice(0)) fn()
  }

  // Ends a client that never got its own socket (e.g. its jump host failed).
  const closeUnstarted = (f: Failure): void => {
    fail(f)
    cleanup()
    setImmediate(() => client.emit('close'))
  }

  client.on('error', (err: Error & { level?: string }) => {
    if (err.level === 'client-authentication') {
      fail({ code: 'auth', message: 'Authentication failed. Check the username, password or key.' }, false)
    } else {
      fail({ message: err.message }, false)
    }
  })
  client.on('close', cleanup)
  // end() also stops the jump hosts and closes any open dialog.
  const end = client.end.bind(client)
  client.end = () => {
    cleanup()
    return end()
  }

  let timer: NodeJS.Timeout | undefined
  const startTimer = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      fail({ message: `Timed out connecting to ${label}.` })
      client.destroy()
    }, READY_TIMEOUT_MS)
  }
  const stopTimer = (): void => clearTimeout(timer)
  client.on('ready', stopTimer)
  cleanups.push(stopTimer)

  const ask = async (question: PromptQuestion): Promise<string[] | null> => {
    stopTimer()
    const pending = ctx.prompter.ask({ ...question, tabId: ctx.tabId, host: label })
    cleanups.push(pending.cancel)
    const answers = await pending.answer
    if (!done) startTimer()
    return answers
  }

  const hostVerifier: HostVerifier = (key, verify) => {
    const fp = fingerprint(key)
    const known = ctx.store.getKnownHost(knownKey)
    if (known === fp) return verify(true)
    if (known) {
      fail({
        code: 'hostkey',
        knownKey,
        fingerprint: fp,
        message: `Host key of ${label} has changed. If you reinstalled the server, trust the new key.`
      })
      return verify(false)
    }
    void ask({ kind: 'hostkey', target: knownKey, keyType: keyType(key), fingerprint: fp }).then((answers) => {
      if (done) return
      if (!answers) {
        fail({ message: `Host key of ${label} was not trusted.` })
        return verify(false)
      }
      ctx.store.setKnownHost(knownKey, fp)
      ctx.info?.(`Saved host key of ${label}: ${fp}`, 'info')
      verify(true)
    })
  }

  // The saved password answers the first plain password prompt; anything else
  // (one-time codes, a second password prompt after a wrong one) goes to the user.
  let passwordUsed = false
  client.on('keyboard-interactive', (title, instructions, _lang, prompts, finish) => {
    if (!prompts.length) return finish([])
    const only = prompts[0]!
    if (
      !passwordUsed &&
      secrets.password &&
      prompts.length === 1 &&
      !only.echo &&
      /password|passphrase/i.test(only.prompt)
    ) {
      passwordUsed = true
      return finish([secrets.password])
    }
    void ask({
      kind: 'auth',
      title,
      instructions,
      prompts: prompts.map((p) => ({ prompt: p.prompt, echo: !!p.echo }))
    }).then((answers) => {
      if (done) return
      if (!answers) {
        fail({ message: 'Login canceled.' })
        client.destroy()
        return
      }
      finish(prompts.map((_, i) => answers[i] ?? ''))
    })
  })

  const config = connectConfig(host, secrets, ctx.store.getSettings(), hostVerifier)
  const connect = (sock?: ClientChannel): void => {
    if (done) return
    started = true
    startTimer()
    try {
      client.connect(sock ? { ...config, sock } : config)
    } catch (err) {
      // e.g. invalid private key format
      started = false
      closeUnstarted({ message: err instanceof Error ? err.message : String(err) })
    }
  }

  const jumpId = host.jumpHostId
  if (!jumpId) {
    // Let the caller attach its listeners before anything can happen.
    setImmediate(() => connect())
    return { client, failure: () => failure }
  }

  const jumpHost = ctx.store.getHost(jumpId)
  if (!jumpHost) {
    closeUnstarted({ message: `The jump host of ${label} no longer exists. Edit the host to pick another.` })
    return { client, failure: () => failure }
  }
  if (via.includes(jumpId) || jumpId === host.id || via.length >= MAX_JUMPS) {
    closeUnstarted({ message: `Jump hosts of ${label} form a loop.` })
    return { client, failure: () => failure }
  }

  const jumpLabel = hostLabel(jumpHost)
  const jump = dial(ctx, jumpHost, [...via, host.id])
  cleanups.push(() => jump.client.end())
  ctx.info?.(`Connecting to ${jumpLabel} (jump host)…`, 'info')

  jump.client.on('ready', () => {
    ctx.info?.(`Connected to ${jumpLabel}, opening a tunnel to ${knownKey}…`, 'info')
    jump.client.forwardOut('127.0.0.1', 0, host.hostname, host.port, (err, stream) => {
      if (done) return void stream?.close()
      if (err) {
        closeUnstarted({ message: `${jumpLabel} could not reach ${knownKey}: ${err.message}` })
        return
      }
      connect(stream)
    })
  })
  jump.client.on('close', () => {
    // Once the target is connected over the tunnel, its own 'close' follows.
    if (started || done) return
    const f = jump.failure()
    if (f?.code === 'hostkey') closeUnstarted(f)
    else closeUnstarted({ message: `Jump host ${jumpLabel}: ${f?.message ?? 'connection closed.'}` })
  })

  return { client, failure: () => failure }
}
