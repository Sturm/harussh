// Path and formatting helpers for the SFTP file browser. Remote paths are
// always POSIX; local paths use "\" on Windows.

export function joinPath(dir: string, name: string, sep: string): string {
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}

export function parentPath(path: string, sep: string): string {
  const trimmed = path.length > 1 && path.endsWith(sep) ? path.slice(0, -1) : path
  const idx = trimmed.lastIndexOf(sep)
  if (idx <= 0) return sep === '/' ? '/' : path
  const parent = trimmed.slice(0, idx)
  // "C:\Users" → "C:\", not "C:"
  return /^[a-zA-Z]:$/.test(parent) ? parent + sep : parent
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(ms: number): string {
  return ms ? dateFormat.format(ms) : ''
}

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const yearFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** Compact date for lists: "14:32" today, "21 Nov 14:32" this year, "3 Mar 2025" before. */
export function formatWhen(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeFormat.format(d)
  if (d.getFullYear() === now.getFullYear()) return `${dayFormat.format(d)} ${timeFormat.format(d)}`
  return yearFormat.format(d)
}

/** Strips Electron's "Error invoking remote method 'x': Error: " prefix. */
export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
