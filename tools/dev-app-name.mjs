// In `npm run dev` macOS takes the app name (Dock, Cmd+Tab, menu bar) from the
// Electron.app bundle in node_modules, so it shows "Electron". This renames that
// bundle to harussh. Runs on postinstall; packaged builds get the name from
// electron-builder.yml instead.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const NAME = 'harussh'

if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url)
  const app = join(dirname(require.resolve('electron')), 'dist', 'Electron.app')
  const plist = join(app, 'Contents', 'Info.plist')
  if (existsSync(plist)) {
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('plutil', ['-replace', key, '-string', NAME, plist])
    }
    // Make LaunchServices pick up the new name instead of a cached one.
    execFileSync('touch', [app])
  }
}
