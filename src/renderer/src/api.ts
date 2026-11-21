export const api = window.api
export const isMac = api.platform === 'darwin'

// One IPC listener for all session output, dispatched to tabs by tabId.
const dataHandlers = new Map<string, (data: string) => void>()
api.onSshData((tabId, data) => dataHandlers.get(tabId)?.(data))

export function onTabData(tabId: string, cb: (data: string) => void): () => void {
  dataHandlers.set(tabId, cb)
  return () => dataHandlers.delete(tabId)
}

/** App shortcuts: ⌘ on macOS, Ctrl+Shift on Windows/Linux (plain Ctrl belongs to the shell). */
export type Shortcut = 'new' | 'close' | 'next' | 'prev' | 'snippets' | `tab:${number}`

export function matchShortcut(e: KeyboardEvent): Shortcut | null {
  if (e.type !== 'keydown') return null
  if (e.ctrlKey && !e.metaKey && e.key === 'Tab') return e.shiftKey ? 'prev' : 'next'
  const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && e.shiftKey && !e.metaKey
  if (!mod) return null
  switch (e.code) {
    case 'KeyT':
      return 'new'
    case 'KeyW':
      return 'close'
    case 'KeyS':
      return 'snippets'
    case 'BracketLeft':
      return 'prev'
    case 'BracketRight':
      return 'next'
  }
  const digit = /^Digit([1-9])$/.exec(e.code)
  return digit ? `tab:${Number(digit[1])}` : null
}

export const modLabel = isMac ? '⌘' : 'Ctrl+Shift+'
