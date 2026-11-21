import type { ResolvedTheme, ThemeDef, ThemeTerminal, ThemeUi } from '../../shared/types'

const fontUi = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', sans-serif"

const darkUi: ThemeUi = {
  bg: '#171a23',
  sidebar: '#12141b',
  tabbar: '#0f1117',
  surface: '#1f2330',
  surface2: '#282d3c',
  border: '#2c3242',
  text: '#e6e9f0',
  textMuted: '#9aa3b5',
  textFaint: '#677086',
  accent: '#3d8bfd',
  accentText: '#ffffff',
  accentSoft: 'rgba(61, 139, 253, 0.16)',
  danger: '#f05d6c',
  success: '#3fcf8e',
  warning: '#f5b84a',
  radius: '10px',
  fontUi
}

const darkTerminal: ThemeTerminal = {
  background: '#13151c',
  foreground: '#d8dee9',
  cursor: '#3d8bfd',
  cursorAccent: '#13151c',
  selectionBackground: 'rgba(61, 139, 253, 0.35)',
  black: '#1c1f27',
  red: '#ef6b73',
  green: '#7ccf8a',
  yellow: '#e8c26e',
  blue: '#5ea1ff',
  magenta: '#c693f5',
  cyan: '#5fd0d6',
  white: '#c9d1dc',
  brightBlack: '#5c6577',
  brightRed: '#ff8a91',
  brightGreen: '#9be3a7',
  brightYellow: '#f5d68f',
  brightBlue: '#85b8ff',
  brightMagenta: '#dab2ff',
  brightCyan: '#86e4e8',
  brightWhite: '#f2f5f9'
}

const lightUi: ThemeUi = {
  ...darkUi,
  bg: '#f6f7fa',
  sidebar: '#eceef3',
  tabbar: '#e3e6ec',
  surface: '#ffffff',
  surface2: '#f0f2f6',
  border: '#d9dde5',
  text: '#1c2130',
  textMuted: '#5b6477',
  textFaint: '#8d95a6',
  accent: '#2f6fe4',
  accentSoft: 'rgba(47, 111, 228, 0.12)',
  danger: '#d6334a',
  success: '#1a9a62',
  warning: '#c7861b'
}

const lightTerminal: ThemeTerminal = {
  background: '#ffffff',
  foreground: '#2b303b',
  cursor: '#2f6fe4',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(47, 111, 228, 0.22)',
  black: '#2b303b',
  red: '#c8374b',
  green: '#2f8a43',
  yellow: '#a8740f',
  blue: '#2f6fe4',
  magenta: '#9446c7',
  cyan: '#13848f',
  white: '#a5abb7',
  brightBlack: '#6c7486',
  brightRed: '#e0485d',
  brightGreen: '#3aa654',
  brightYellow: '#c48d1a',
  brightBlue: '#4d86f0',
  brightMagenta: '#ab5fdc',
  brightCyan: '#1aa0ad',
  brightWhite: '#d5d9e0'
}

export const builtInThemes: ThemeDef[] = [
  { id: 'midnight', name: 'Midnight', type: 'dark', ui: {}, terminal: {} },
  {
    id: 'ocean',
    name: 'Ocean',
    type: 'dark',
    ui: {
      bg: '#0f1d24',
      sidebar: '#0b171d',
      tabbar: '#081217',
      surface: '#15272f',
      surface2: '#1c323b',
      border: '#213a44',
      text: '#e2f1f4',
      textMuted: '#8fb0b9',
      textFaint: '#5f818a',
      accent: '#2dd4bf',
      accentText: '#04201c',
      accentSoft: 'rgba(45, 212, 191, 0.14)'
    },
    terminal: {
      background: '#0b181e',
      foreground: '#d3e9ee',
      cursor: '#2dd4bf',
      cursorAccent: '#0b181e',
      selectionBackground: 'rgba(45, 212, 191, 0.28)',
      blue: '#4fb3ff',
      cyan: '#2dd4bf',
      brightCyan: '#6ee9d8'
    }
  },
  {
    id: 'ember',
    name: 'Ember',
    type: 'dark',
    ui: {
      bg: '#1d1714',
      sidebar: '#171210',
      tabbar: '#130f0d',
      surface: '#28201c',
      surface2: '#332924',
      border: '#3a2f29',
      text: '#f3e9e2',
      textMuted: '#b5a397',
      textFaint: '#85746a',
      accent: '#ff8a4c',
      accentText: '#2a1205',
      accentSoft: 'rgba(255, 138, 76, 0.15)'
    },
    terminal: {
      background: '#171210',
      foreground: '#eadfd6',
      cursor: '#ff8a4c',
      cursorAccent: '#171210',
      selectionBackground: 'rgba(255, 138, 76, 0.28)',
      yellow: '#f2b45a',
      red: '#f0715f'
    }
  },
  { id: 'daylight', name: 'Daylight', type: 'light', ui: {}, terminal: {} }
]

/** Fills missing theme keys from the base theme (dark / light). */
export function resolveTheme(def: ThemeDef): ResolvedTheme {
  const light = def.type === 'light'
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    custom: def.custom,
    ui: { ...(light ? lightUi : darkUi), ...def.ui },
    terminal: { ...(light ? lightTerminal : darkTerminal), ...def.terminal }
  }
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

/** A theme is CSS variables on :root, so every component reads its colors from them. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.ui) as [string, string][]) {
    root.style.setProperty('--' + kebab(key), value)
  }
  root.style.colorScheme = theme.type
  root.dataset.theme = theme.id
}
