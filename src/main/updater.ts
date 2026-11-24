import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

// Updates come from GitHub Releases (publish config in electron-builder.yml).
const RELEASES_URL = 'https://github.com/Sturm/harussh/releases/latest'
const FIRST_CHECK_DELAY = 10_000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

// Builds that can replace themselves. Elsewhere the app only reports a new
// version and links to the release page:
// - macOS: Squirrel.Mac only installs code-signed apps, and ours aren't signed;
// - the portable .exe and the .deb have nothing to update in place.
function canSelfUpdate(): boolean {
  switch (process.platform) {
    case 'win32':
      return !process.env.PORTABLE_EXECUTABLE_DIR
    case 'linux':
      return !!process.env.APPIMAGE
    default:
      return false
  }
}

export class Updater {
  private status: UpdateStatus
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly emit: (status: UpdateStatus) => void,
    private readonly autoCheck: () => boolean
  ) {
    const canInstall = app.isPackaged && canSelfUpdate()
    this.status = app.isPackaged
      ? { state: 'idle', current: app.getVersion(), canInstall }
      : {
          state: 'unsupported',
          current: app.getVersion(),
          canInstall,
          message: 'Updates work in installed builds only.'
        }
    if (!app.isPackaged) return

    autoUpdater.autoDownload = canInstall
    autoUpdater.autoInstallOnAppQuit = canInstall
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'latest' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ state: canInstall ? 'downloading' : 'available', version: info.version, percent: 0 })
    )
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version }))
    autoUpdater.on('error', (err) => this.failed(err))

    setTimeout(() => this.autoCheckNow(), FIRST_CHECK_DELAY)
    this.timer = setInterval(() => this.autoCheckNow(), CHECK_INTERVAL)
  }

  get(): UpdateStatus {
    return this.status
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.status
    // Already found or downloading — nothing new to learn.
    if (['checking', 'downloading', 'ready'].includes(this.status.state)) return this.status
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.failed(err)
    }
    return this.status
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
    else void shell.openExternal(RELEASES_URL)
  }

  dispose(): void {
    clearInterval(this.timer)
  }

  private autoCheckNow(): void {
    if (this.autoCheck()) void this.check()
  }

  private failed(err: unknown): void {
    const message = shortError(err)
    // Before the first release GitHub has nothing to compare with.
    if (message.startsWith('No published versions')) this.set({ state: 'latest' })
    else this.set({ state: 'error', message })
  }

  private set(patch: Partial<UpdateStatus>): void {
    const { state, current, version, canInstall } = this.status
    // Messages and progress belong to one state only; the found version stays.
    this.status = { state, current, canInstall, ...(version ? { version } : {}), ...patch }
    this.emit(this.status)
  }
}

function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|net::ERR_/.test(msg)) return 'No connection to GitHub.'
  // electron-updater errors can carry whole HTTP responses — keep the first line.
  return msg.split('\n')[0]!.slice(0, 200)
}
