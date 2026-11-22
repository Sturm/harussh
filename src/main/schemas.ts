// Runtime validation for everything that crosses the IPC boundary from the
// renderer, and for theme files read from disk. TypeScript types alone are not
// enforced at runtime, so a compromised renderer could send anything.
import { z } from 'zod'
import type { HostInput, Settings, Snippet, ThemeDef, ThemeTerminal, ThemeUi } from '../shared/types'

export const id = z.string().min(1).max(128)
const text = (max: number): z.ZodString => z.string().max(max)
// undefined = keep, null = remove, string = set. Plain optional (not exactOptional):
// the host editor sends `password: undefined` for "keep", and IPC preserves the key.
const secret = (max: number): z.ZodOptional<z.ZodNullable<z.ZodString>> => text(max).nullable().optional()

export const hostInput: z.ZodType<HostInput> = z.strictObject({
  id: id.optional(),
  label: text(200),
  group: text(200),
  hostname: z.string().trim().min(1).max(255),
  port: z.int().min(1).max(65535),
  username: text(255),
  auth: z.enum(['password', 'key', 'agent']),
  color: text(64),
  autoReconnect: z.boolean(),
  password: secret(4096),
  privateKey: secret(64 * 1024),
  passphrase: secret(4096)
})

export const snippetInput: z.ZodType<Omit<Snippet, 'id'> & { id?: string }> = z.strictObject({
  id: id.exactOptional(),
  name: text(200),
  command: text(64 * 1024),
  autoRun: z.boolean()
})

export const settingsPatch: z.ZodType<Partial<Settings>> = z.strictObject({
  themeId: text(200).exactOptional(),
  fontFamily: text(500).exactOptional(),
  fontSize: z.number().min(6).max(72).exactOptional(),
  lineHeight: z.number().min(0.8).max(3).exactOptional(),
  cursorStyle: z.enum(['block', 'bar', 'underline']).exactOptional(),
  cursorBlink: z.boolean().exactOptional(),
  scrollback: z.number().min(0).max(1_000_000).exactOptional(),
  copyOnSelect: z.boolean().exactOptional(),
  keepAliveInterval: z.number().min(0).max(3600).exactOptional()
})

// Unknown keys are dropped; every value must be a string (it becomes a CSS variable / xterm color).
function colors<K extends string>(keys: readonly K[]): z.ZodType<Partial<Record<K, string>>> {
  return z
    .object(Object.fromEntries(keys.map((k) => [k, text(200).exactOptional()])))
    .catch({}) as unknown as z.ZodType<Partial<Record<K, string>>>
}

const uiKeys = [
  'bg',
  'sidebar',
  'tabbar',
  'surface',
  'surface2',
  'border',
  'text',
  'textMuted',
  'textFaint',
  'accent',
  'accentText',
  'accentSoft',
  'danger',
  'success',
  'warning',
  'radius',
  'fontUi'
] as const satisfies readonly (keyof ThemeUi)[]

const terminalKeys = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const satisfies readonly (keyof ThemeTerminal)[]

export const themeUi = colors(uiKeys)
export const themeTerminal = colors(terminalKeys)

export const themeInput: z.ZodType<Pick<ThemeDef, 'id' | 'name' | 'type' | 'ui' | 'terminal'>> = z.object({
  id: text(200),
  name: text(200),
  type: z.enum(['dark', 'light']),
  ui: themeUi,
  terminal: themeTerminal
})

export const tabId = id
export const termSize = z.int().min(1).max(10_000)
export const cssColor = text(64)
export const fileSide = z.enum(['local', 'remote'])
export const fsPath = z.string().min(1).max(4096)
export const fsPaths = z.array(fsPath).min(1).max(10_000)
