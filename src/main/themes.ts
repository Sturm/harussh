import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { ThemeBackground, ThemeDef } from '../shared/types'
import { themeTerminal, themeUi } from './schemas'

const EXAMPLE: ThemeDef = {
  id: 'sunset',
  name: 'Sunset (custom theme example)',
  type: 'dark',
  ui: {
    bg: '#1e1621',
    sidebar: '#181119',
    tabbar: '#140e15',
    surface: '#2a1f2d',
    surface2: '#352838',
    border: '#3d2f40',
    accent: '#ff7a59',
    accentSoft: 'rgba(255, 122, 89, 0.16)'
  },
  terminal: {
    background: '#1a131c',
    foreground: '#f3e3e8',
    cursor: '#ff7a59'
  }
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
}
const MAX_IMAGE = 25 * 1024 * 1024

const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** `background` from a theme file: the image must be a plain file name in the themes folder. */
function readBackground(raw: unknown, dir: string): ThemeBackground | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const bg = raw as Record<string, unknown>
  const name = typeof bg.image === 'string' ? bg.image : ''
  const ext = /^[\w .-]+\.(\w+)$/.exec(name)?.[1]?.toLowerCase()
  const mime = ext && IMAGE_TYPES[ext]
  if (!mime || name.startsWith('.')) return undefined
  const file = join(dir, name)
  try {
    if (statSync(file).size > MAX_IMAGE) return undefined
    return {
      image: `data:${mime};base64,${readFileSync(file).toString('base64')}`,
      dim: clamp(bg.dim, 0, 0.9, 0.2),
      position: typeof bg.position === 'string' && bg.position.length <= 100 ? bg.position : 'center',
      blur: clamp(bg.blur, 0, 40, 12)
    }
  } catch {
    return undefined
  }
}

/** Custom themes: *.json files in <userData>/themes, hot-reloaded. */
export class ThemeStore {
  readonly dir: string
  private watcher: FSWatcher | null = null

  constructor(userData: string) {
    this.dir = join(userData, 'themes')
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(join(this.dir, 'sunset.json'), JSON.stringify(EXAMPLE, null, 2))
    }
  }

  list(): ThemeDef[] {
    const themes: ThemeDef[] = []
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue
      const parsed = this.parse(join(this.dir, file))
      if (parsed) themes.push(parsed)
    }
    return themes
  }

  private parse(path: string): ThemeDef | null {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ThemeDef>
      if (typeof raw !== 'object' || raw === null) return null
      const fallbackId = basename(path, '.json')
      return {
        id: 'custom:' + String(raw.id || fallbackId),
        name: String(raw.name || fallbackId),
        type: raw.type === 'light' ? 'light' : 'dark',
        ui: themeUi.parse(raw.ui),
        terminal: themeTerminal.parse(raw.terminal),
        background: readBackground(raw.background, dirname(path)),
        custom: true,
        file: path
      }
    } catch {
      return null
    }
  }

  import(source: string): ThemeDef | null {
    if (!this.parse(source)) return null
    const target = join(this.dir, basename(source))
    copyFileSync(source, target)
    return this.parse(target)
  }

  /** Saves a copy of a theme to the folder so it can be edited as JSON. */
  saveCopy(theme: Pick<ThemeDef, 'id' | 'name' | 'type' | 'ui' | 'terminal'>): ThemeDef {
    const baseId = theme.id.replace(/^custom:/, '').replace(/[^a-z0-9-_]/gi, '-') + '-copy'
    let id = baseId
    for (let i = 2; existsSync(join(this.dir, id + '.json')); i++) id = `${baseId}-${i}`
    const def = { id, name: `${theme.name} (copy)`, type: theme.type, ui: theme.ui, terminal: theme.terminal }
    const path = join(this.dir, id + '.json')
    writeFileSync(path, JSON.stringify(def, null, 2))
    return this.parse(path)!
  }

  watch(onChange: () => void): void {
    let timer: NodeJS.Timeout | null = null
    try {
      this.watcher = watch(this.dir, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(onChange, 200)
      })
    } catch {
      // fs.watch unsupported — themes refresh after a restart
    }
  }

  dispose(): void {
    this.watcher?.close()
  }
}
