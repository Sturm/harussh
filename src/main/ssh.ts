import { Client, type ClientChannel, type SyncHostVerifier } from 'ssh2'
import { StringDecoder } from 'node:string_decoder'
import type { SessionStatus, SessionStatusEvent } from '../shared/types'
import { answerKeyboardInteractive, connectConfig, fingerprint, knownHostKey } from './connection'
import type { Store } from './store'

const MAX_RECONNECT_ATTEMPTS = 10

export interface SshEvents {
  data(tabId: string, data: string): void
  status(tabId: string, event: SessionStatusEvent): void
}

class Session {
  client: Client | null = null
  stream: ClientChannel | null = null
  decoder = new StringDecoder('utf8')
  status: SessionStatus = 'connecting'
  closedByUser = false
  everConnected = false
  shellExited = false
  attempts = 0
  timer: NodeJS.Timeout | null = null
  historyId: string | null = null
  lastError: string | null = null
  pendingFingerprint: string | null = null
  outBuffer = ''
  flushScheduled = false

  constructor(
    public tabId: string,
    public hostId: string,
    public cols: number,
    public rows: number
  ) {}
}

export class SshManager {
  private sessions = new Map<string, Session>()

  constructor(
    private store: Store,
    private events: SshEvents
  ) {}

  open(tabId: string, hostId: string, cols: number, rows: number): void {
    this.close(tabId)
    const s = new Session(tabId, hostId, cols, rows)
    this.sessions.set(tabId, s)
    this.connect(s)
  }

  write(tabId: string, data: string): void {
    this.sessions.get(tabId)?.stream?.write(data)
  }

  resize(tabId: string, cols: number, rows: number): void {
    const s = this.sessions.get(tabId)
    if (!s || cols < 2 || rows < 2) return
    s.cols = cols
    s.rows = rows
    s.stream?.setWindow(rows, cols, 0, 0)
  }

  close(tabId: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    s.closedByUser = true
    if (s.timer) clearTimeout(s.timer)
    s.client?.end()
    if (s.historyId) this.store.endHistory(s.historyId)
    this.sessions.delete(tabId)
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }

  /** Manual "Reconnect": immediately, with the attempt counter reset. */
  reconnect(tabId: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    if (s.timer) clearTimeout(s.timer)
    s.timer = null
    const old = s.client
    s.client = null
    old?.end()
    s.attempts = 0
    s.shellExited = false
    s.closedByUser = false
    this.connect(s)
  }

  trustHostKey(tabId: string): void {
    const s = this.sessions.get(tabId)
    const host = s && this.store.getHost(s.hostId)
    if (!s || !host || !s.pendingFingerprint) return
    this.store.setKnownHost(knownHostKey(host), s.pendingFingerprint)
    s.pendingFingerprint = null
    this.reconnect(tabId)
  }

  /** After the computer wakes up, don't wait for the backoff, retry now. */
  onResume(): void {
    for (const s of this.sessions.values()) {
      if (s.status === 'reconnecting' && s.timer) this.reconnect(s.tabId)
    }
  }

  private connect(s: Session): void {
    const host = this.store.getHost(s.hostId)
    if (!host) {
      this.setStatus(s, { status: 'error', message: 'This host has been deleted.' })
      return
    }
    const secrets = this.store.getSecrets(host.id)
    const settings = this.store.getSettings()
    const target = `${host.username}@${host.hostname}:${host.port}`
    const knownKey = knownHostKey(host)

    this.setStatus(s, {
      status: s.everConnected ? 'reconnecting' : 'connecting',
      message: `Connecting to ${target}…`
    })
    this.info(s, `Connecting to ${target}…`, 'info')

    const client = new Client()
    s.client = client
    s.decoder = new StringDecoder('utf8')
    s.lastError = null
    let authFailed = false
    let hostKeyMismatch = false

    const hostVerifier: SyncHostVerifier = (key) => {
      const fp = fingerprint(key)
      const known = this.store.getKnownHost(knownKey)
      if (!known) {
        this.store.setKnownHost(knownKey, fp)
        this.info(s, `Saved host key ${fp}`, 'info')
        return true
      }
      if (known === fp) return true
      hostKeyMismatch = true
      s.pendingFingerprint = fp
      return false
    }

    const config = connectConfig(host, secrets, settings, hostVerifier)
    answerKeyboardInteractive(client, secrets)

    client.on('ready', () => {
      client.shell({ term: 'xterm-256color', cols: s.cols, rows: s.rows }, (err, stream) => {
        if (err) {
          s.lastError = err.message
          client.end()
          return
        }
        const wasReconnect = s.everConnected
        s.stream = stream
        s.everConnected = true
        s.attempts = 0
        this.setStatus(s, { status: 'connected' })
        if (wasReconnect) {
          this.info(s, 'Reconnected', 'ok')
        } else {
          this.store.touchHost(host.id)
          s.historyId = this.store.addHistory({
            hostId: host.id,
            label: host.label || host.hostname,
            target,
            connectedAt: Date.now(),
            ok: true
          })
        }
        stream.on('data', (d: Buffer) => this.pushData(s, d))
        stream.stderr.on('data', (d: Buffer) => this.pushData(s, d))
        stream.on('exit', () => {
          s.shellExited = true
        })
        stream.on('close', () => client.end())
      })
    })

    client.on('error', (err: Error & { level?: string }) => {
      if (err.level === 'client-authentication') authFailed = true
      s.lastError = err.message
    })

    client.on('close', () => {
      if (s.client !== client) return // stale connection after a manual reconnect
      s.client = null
      s.stream = null
      if (s.closedByUser) return

      if (hostKeyMismatch) {
        this.info(s, `WARNING: host key for ${knownKey} has changed! New: ${s.pendingFingerprint}`, 'error')
        this.setStatus(s, {
          status: 'error',
          code: 'hostkey',
          message: 'Host key changed. If you reinstalled the server, trust the new key.'
        })
        return
      }
      if (authFailed) {
        this.info(s, 'Authentication failed', 'error')
        this.setStatus(s, {
          status: 'error',
          code: 'auth',
          message: 'Authentication failed. Check the username, password or key.'
        })
        return
      }
      if (!s.everConnected) {
        const message = s.lastError ?? 'Could not connect'
        this.info(s, message, 'error')
        this.store.addHistory({
          hostId: host.id,
          label: host.label || host.hostname,
          target,
          connectedAt: Date.now(),
          ok: false,
          error: message
        })
        this.setStatus(s, { status: 'error', message })
        return
      }
      if (s.shellExited || !host.autoReconnect) {
        if (s.historyId) this.store.endHistory(s.historyId)
        this.info(s, s.shellExited ? 'Session ended' : 'Connection closed', 'warn')
        this.setStatus(s, {
          status: 'disconnected',
          message: s.shellExited ? 'Session ended.' : (s.lastError ?? 'Connection closed.')
        })
        return
      }
      this.scheduleReconnect(s)
    })

    try {
      client.connect(config)
    } catch (err) {
      // e.g. invalid private key format
      const message = err instanceof Error ? err.message : String(err)
      s.client = null
      this.info(s, message, 'error')
      this.setStatus(s, { status: 'error', message })
    }
  }

  private scheduleReconnect(s: Session): void {
    s.attempts++
    if (s.attempts > MAX_RECONNECT_ATTEMPTS) {
      if (s.historyId) this.store.endHistory(s.historyId)
      this.info(s, 'Could not restore the connection', 'error')
      this.setStatus(s, { status: 'disconnected', message: 'Could not restore the connection.' })
      return
    }
    const delay = Math.min(30_000, 1000 * 2 ** (s.attempts - 1))
    const reason = s.lastError ? ` (${s.lastError})` : ''
    this.info(s, `Connection lost${reason}, retrying in ${Math.round(delay / 1000)}s`, 'warn')
    this.setStatus(s, {
      status: 'reconnecting',
      message: `Connection lost. Attempt ${s.attempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay / 1000)}s…`
    })
    s.timer = setTimeout(() => {
      s.timer = null
      this.connect(s)
    }, delay)
  }

  private setStatus(s: Session, event: SessionStatusEvent): void {
    s.status = event.status
    this.events.status(s.tabId, event)
  }

  // Batch output into one IPC message per event-loop tick: with heavy output
  // (e.g. cat on a big file) this is far cheaper than one IPC per packet.
  private pushData(s: Session, chunk: Buffer): void {
    s.outBuffer += s.decoder.write(chunk)
    if (s.flushScheduled) return
    s.flushScheduled = true
    setImmediate(() => {
      s.flushScheduled = false
      const out = s.outBuffer
      s.outBuffer = ''
      if (out) this.events.data(s.tabId, out)
    })
  }

  private info(s: Session, text: string, kind: 'info' | 'ok' | 'warn' | 'error'): void {
    const color = { info: '36', ok: '32', warn: '33', error: '31' }[kind]
    this.events.data(s.tabId, `\r\n\x1b[${color}m● ${text}\x1b[0m\r\n`)
  }
}
