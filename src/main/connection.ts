// Connection setup shared by terminal (ssh.ts) and file transfer (sftp.ts) sessions.
import type { Client, ConnectConfig, SyncHostVerifier } from 'ssh2'
import { createHash } from 'node:crypto'
import type { Host, Settings } from '../shared/types'
import type { Secrets } from './store'

export function fingerprint(key: Buffer): string {
  return 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
}

export function knownHostKey(host: Pick<Host, 'hostname' | 'port'>): string {
  return `${host.hostname}:${host.port}`
}

export function connectConfig(
  host: Pick<Host, 'hostname' | 'port' | 'username' | 'auth'>,
  secrets: Secrets,
  settings: Settings,
  hostVerifier: SyncHostVerifier
): ConnectConfig {
  const config: ConnectConfig = {
    host: host.hostname,
    port: host.port,
    username: host.username,
    readyTimeout: 20_000,
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

export function answerKeyboardInteractive(client: Client, secrets: Secrets): void {
  client.on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => {
    finish(prompts.map(() => secrets.password ?? ''))
  })
}
