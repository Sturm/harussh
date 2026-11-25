import { Client, type FileEntryWithStats, type SFTPWrapper, type Stats } from 'ssh2'
import { shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, type Stats as FsStats } from 'node:fs'
import { mkdir, readdir, rename, stat, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, posix } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { DirListing, FileEntry, SessionStatus, SessionStatusEvent, Transfer } from '../shared/types'
import { answerKeyboardInteractive, connectConfig, fingerprint, knownHostKey } from './connection'
import type { Store } from './store'

const PROGRESS_INTERVAL_MS = 150

export interface SftpEvents {
  status(tabId: string, event: SessionStatusEvent): void
  transfer(transfer: Transfer): void
}

interface Job {
  transfer: Transfer
  abort: AbortController
  run(job: Job): Promise<void>
}

// One file (or directory to create) inside a transfer.
interface Item {
  from: string
  to: string
  dir: boolean
  size: number
}

class Session {
  client: Client | null = null
  sftp: SFTPWrapper | null = null
  status: SessionStatus = 'connecting'
  pendingFingerprint: string | null = null
  queue: Job[] = []
  running = false

  constructor(
    public tabId: string,
    public hostId: string
  ) {}
}

function call<T = void>(fn: (cb: (err: Error | null | undefined, res: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => fn((err, res) => (err ? reject(err) : resolve(res))))
}

function remoteEntry(name: string, attrs: Stats, target: Stats | null): FileEntry {
  const s = target ?? attrs
  return {
    name,
    type: s.isDirectory() ? 'dir' : s.isFile() ? 'file' : 'other',
    link: attrs.isSymbolicLink(),
    size: s.size,
    mtime: s.mtime * 1000,
    mode: s.mode
  }
}

function localEntry(name: string, attrs: FsStats, target: FsStats | null): FileEntry {
  const s = target ?? attrs
  return {
    name,
    type: s.isDirectory() ? 'dir' : s.isFile() ? 'file' : 'other',
    link: attrs.isSymbolicLink(),
    size: s.size,
    mtime: s.mtimeMs,
    mode: s.mode
  }
}

export class SftpManager {
  private sessions = new Map<string, Session>()
  private jobs = new Map<string, Job>()

  constructor(
    private store: Store,
    private events: SftpEvents
  ) {}

  open(tabId: string, hostId: string): void {
    this.close(tabId)
    const s = new Session(tabId, hostId)
    this.sessions.set(tabId, s)
    this.connect(s)
  }

  close(tabId: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    this.sessions.delete(tabId)
    this.failQueue(s, 'canceled')
    s.client?.end()
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }

  reconnect(tabId: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    const old = s.client
    s.client = null
    s.sftp = null
    old?.end()
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

  private connect(s: Session): void {
    const host = this.store.getHost(s.hostId)
    if (!host) {
      this.setStatus(s, { status: 'error', message: 'This host has been deleted.' })
      return
    }
    const secrets = this.store.getSecrets(host.id)
    const knownKey = knownHostKey(host)
    this.setStatus(s, { status: 'connecting', message: `Connecting to ${host.username}@${host.hostname}…` })

    const client = new Client()
    s.client = client
    let lastError: string | null = null
    let authFailed = false
    let hostKeyMismatch = false

    const config = connectConfig(host, secrets, this.store.getSettings(), (key) => {
      const fp = fingerprint(key)
      const known = this.store.getKnownHost(knownKey)
      if (!known) {
        this.store.setKnownHost(knownKey, fp)
        return true
      }
      if (known === fp) return true
      hostKeyMismatch = true
      s.pendingFingerprint = fp
      return false
    })
    answerKeyboardInteractive(client, secrets)

    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          lastError = `SFTP is not available on this server (${err.message}).`
          client.end()
          return
        }
        s.sftp = sftp
        this.store.touchHost(host.id)
        this.setStatus(s, { status: 'connected' })
        sftp.on('close', () => client.end())
      })
    })

    client.on('error', (err: Error & { level?: string }) => {
      if (err.level === 'client-authentication') authFailed = true
      lastError = err.message
    })

    client.on('close', () => {
      if (s.client !== client) return // stale connection after a manual reconnect
      s.client = null
      s.sftp = null
      this.failQueue(s, 'error', 'Connection closed')
      if (!this.sessions.has(s.tabId)) return
      if (hostKeyMismatch) {
        this.setStatus(s, {
          status: 'error',
          code: 'hostkey',
          message: 'Host key changed. If you reinstalled the server, trust the new key.'
        })
      } else if (authFailed) {
        this.setStatus(s, {
          status: 'error',
          code: 'auth',
          message: 'Authentication failed. Check the username, password or key.'
        })
      } else if (s.status === 'connected') {
        this.setStatus(s, { status: 'disconnected', message: lastError ?? 'Connection closed.' })
      } else {
        this.setStatus(s, { status: 'error', message: lastError ?? 'Could not connect' })
      }
    })

    try {
      client.connect(config)
    } catch (err) {
      s.client = null
      this.setStatus(s, { status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private setStatus(s: Session, event: SessionStatusEvent): void {
    s.status = event.status
    this.events.status(s.tabId, event)
  }

  private sftpFor(tabId: string): SFTPWrapper {
    const sftp = this.sessions.get(tabId)?.sftp
    if (!sftp) throw new Error('Not connected')
    return sftp
  }

  // --- browsing ---

  async home(side: 'local' | 'remote', tabId: string): Promise<string> {
    if (side === 'local') return homedir()
    const sftp = this.sftpFor(tabId)
    return call<string>((cb) => sftp.realpath('.', cb))
  }

  async list(side: 'local' | 'remote', tabId: string, path: string): Promise<DirListing> {
    if (side === 'local') {
      const names = await readdir(path)
      const entries = await Promise.all(
        names.map(async (name) => {
          const full = join(path, name)
          try {
            const attrs = await lstat(full)
            const target = attrs.isSymbolicLink() ? await stat(full).catch(() => null) : null
            return localEntry(name, attrs, target)
          } catch {
            return null // vanished, or no permission to stat
          }
        })
      )
      return { path, entries: entries.filter((e) => e !== null) }
    }

    const sftp = this.sftpFor(tabId)
    const abs = await call<string>((cb) => sftp.realpath(path, cb))
    const list = await call<FileEntryWithStats[]>((cb) => sftp.readdir(abs, cb))
    const entries = await Promise.all(
      list.map(async ({ filename, attrs }) => {
        const target = attrs.isSymbolicLink()
          ? await call<Stats>((cb) => sftp.stat(posix.join(abs, filename), cb)).catch(() => null)
          : null
        return remoteEntry(filename, attrs, target)
      })
    )
    return { path: abs, entries }
  }

  async mkdir(side: 'local' | 'remote', tabId: string, path: string): Promise<void> {
    if (side === 'local') {
      await mkdir(path)
      return
    }
    const sftp = this.sftpFor(tabId)
    await call((cb) => sftp.mkdir(path, cb))
  }

  async rename(side: 'local' | 'remote', tabId: string, from: string, to: string): Promise<void> {
    if (side === 'local') {
      await rename(from, to)
      return
    }
    const sftp = this.sftpFor(tabId)
    await call((cb) => sftp.rename(from, to, cb))
  }

  async delete(side: 'local' | 'remote', tabId: string, paths: string[]): Promise<void> {
    if (side === 'local') {
      for (const p of paths) await shell.trashItem(p)
      return
    }
    const sftp = this.sftpFor(tabId)
    for (const p of paths) await this.removeRemote(sftp, p)
  }

  private async removeRemote(sftp: SFTPWrapper, path: string): Promise<void> {
    const attrs = await call<Stats>((cb) => sftp.lstat(path, cb))
    if (!attrs.isDirectory()) {
      await call((cb) => sftp.unlink(path, cb))
      return
    }
    for (const { filename } of await call<FileEntryWithStats[]>((cb) => sftp.readdir(path, cb))) {
      await this.removeRemote(sftp, posix.join(path, filename))
    }
    await call((cb) => sftp.rmdir(path, cb))
  }

  // --- transfers ---

  upload(tabId: string, localPaths: string[], remoteDir: string): void {
    for (const local of localPaths) {
      this.enqueue(tabId, 'upload', basename(local), remoteDir, async (job) => {
        const sftp = this.sftpFor(tabId)
        const items = await this.scanLocal(local, posix.join(remoteDir, basename(local)))
        this.setTotal(job, items)
        for (const item of items) {
          if (job.abort.signal.aborted) return
          if (item.dir) {
            const exists = await call<Stats>((cb) => sftp.stat(item.to, cb)).catch(() => null)
            if (!exists) await call((cb) => sftp.mkdir(item.to, cb))
          } else {
            await this.copy(job, createReadStream(item.from), sftp.createWriteStream(item.to))
          }
        }
      })
    }
  }

  download(tabId: string, remotePaths: string[], localDir: string): void {
    for (const remote of remotePaths) {
      this.enqueue(tabId, 'download', posix.basename(remote), localDir, async (job) => {
        const sftp = this.sftpFor(tabId)
        const items = await this.scanRemote(sftp, remote, join(localDir, posix.basename(remote)))
        this.setTotal(job, items)
        for (const item of items) {
          if (job.abort.signal.aborted) return
          if (item.dir) await mkdir(item.to, { recursive: true })
          else await this.copy(job, sftp.createReadStream(item.from), createWriteStream(item.to))
        }
      })
    }
  }

  cancel(transferId: string): void {
    const job = this.jobs.get(transferId)
    if (!job) return
    job.abort.abort()
    if (job.transfer.state === 'queued') this.finish(job, 'canceled')
  }

  // Symlinked directories are copied as nothing rather than followed, so a link
  // loop can't make a transfer run forever. Symlinked files are copied as files.
  private async scanLocal(from: string, to: string): Promise<Item[]> {
    const attrs = await stat(from)
    if (!attrs.isDirectory()) return [{ from, to, dir: false, size: attrs.size }]
    const items: Item[] = [{ from, to, dir: true, size: 0 }]
    for (const name of await readdir(from)) {
      const child = join(from, name)
      if ((await lstat(child)).isSymbolicLink()) {
        const target = await stat(child).catch(() => null)
        if (!target || target.isDirectory()) continue
      }
      items.push(...(await this.scanLocal(child, posix.join(to, name))))
    }
    return items
  }

  private async scanRemote(sftp: SFTPWrapper, from: string, to: string): Promise<Item[]> {
    const attrs = await call<Stats>((cb) => sftp.stat(from, cb))
    if (!attrs.isDirectory()) return [{ from, to, dir: false, size: attrs.size }]
    const items: Item[] = [{ from, to, dir: true, size: 0 }]
    for (const { filename, attrs: l } of await call<FileEntryWithStats[]>((cb) => sftp.readdir(from, cb))) {
      const child = posix.join(from, filename)
      if (l.isSymbolicLink()) {
        const target = await call<Stats>((cb) => sftp.stat(child, cb)).catch(() => null)
        if (!target || target.isDirectory()) continue
      }
      items.push(...(await this.scanRemote(sftp, child, join(to, filename))))
    }
    return items
  }

  private setTotal(job: Job, items: Item[]): void {
    job.transfer.total = items.reduce((sum, i) => sum + i.size, 0)
    job.transfer.files = items.filter((i) => !i.dir).length
    this.events.transfer({ ...job.transfer })
  }

  private async copy(job: Job, from: NodeJS.ReadableStream, to: NodeJS.WritableStream): Promise<void> {
    let last = 0
    from.on('data', (chunk: Buffer) => {
      job.transfer.bytes += chunk.length
      const now = Date.now()
      if (now - last < PROGRESS_INTERVAL_MS) return
      last = now
      this.events.transfer({ ...job.transfer })
    })
    await pipeline(from, to, { signal: job.abort.signal })
  }

  private enqueue(
    tabId: string,
    direction: Transfer['direction'],
    name: string,
    destDir: string,
    run: Job['run']
  ): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    const job: Job = {
      transfer: { id: randomUUID(), tabId, direction, name, destDir, bytes: 0, total: 0, files: 0, state: 'queued' },
      abort: new AbortController(),
      run
    }
    this.jobs.set(job.transfer.id, job)
    s.queue.push(job)
    this.events.transfer({ ...job.transfer })
    void this.drain(s)
  }

  // One transfer at a time per tab: parallel transfers over a single
  // connection don't finish any sooner, and a queue is easier to follow.
  private async drain(s: Session): Promise<void> {
    if (s.running) return
    s.running = true
    while (s.queue.length) {
      const job = s.queue.shift()!
      if (job.transfer.state !== 'queued') continue
      job.transfer.state = 'running'
      this.events.transfer({ ...job.transfer })
      try {
        await job.run(job)
        this.finish(job, job.abort.signal.aborted ? 'canceled' : 'done')
      } catch (err) {
        if (job.abort.signal.aborted) this.finish(job, 'canceled')
        else this.finish(job, 'error', err instanceof Error ? err.message : String(err))
      }
    }
    s.running = false
  }

  private failQueue(s: Session, state: 'error' | 'canceled', error?: string): void {
    for (const job of this.jobs.values()) {
      if (job.transfer.tabId !== s.tabId) continue
      if (job.transfer.state !== 'queued' && job.transfer.state !== 'running') continue
      job.abort.abort()
      this.finish(job, state, error)
    }
    s.queue = []
  }

  private finish(job: Job, state: Transfer['state'], error?: string): void {
    if (job.transfer.state !== 'queued' && job.transfer.state !== 'running') return
    job.transfer.state = state
    job.transfer.error = error
    this.jobs.delete(job.transfer.id)
    this.events.transfer({ ...job.transfer })
  }
}
