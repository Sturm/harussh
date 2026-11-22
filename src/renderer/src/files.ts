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

/** Strips Electron's "Error invoking remote method 'x': Error: " prefix. */
export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
