// Works out which command the user just ran in a terminal, for the History panel.
//
// The shell owns the command line, so the client can only guess. Keystrokes are
// tracked as long as they are plain typing; once arrows, Tab completion or other
// escape sequences are used, the command is read back from the screen instead,
// taking the text after the prompt. Nothing is recorded in full-screen programs
// (vim, less, htop) or when the typed text never appeared on screen — that is a
// password prompt with echo turned off.
import type { Terminal } from '@xterm/xterm'

const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'
// "user@host:~$ ", "root@host:/# ", "% ", "> ", "❯ "
const PROMPT = /^[^$#%>❯]*[$#%>❯] /
const MAX_LENGTH = 8192

export class CommandCapture {
  private typed = ''
  // Typed text no longer matches the command line (arrows, Tab, Ctrl+R…).
  private dirty = false

  constructor(private term: Terminal) {}

  /** Feed every chunk of user input; returns the command when Enter was pressed. */
  input(data: string): string | null {
    let command: string | null = null
    const chunk = data.startsWith(PASTE_START) ? data.slice(PASTE_START.length).replace(PASTE_END, '') : data
    for (const part of chunk.split(/(\r)/)) {
      if (part === '\r') {
        command = this.commit()
        continue
      }
      if (!part) continue
      if (part === '\x7f' || part === '\b') this.typed = this.typed.slice(0, -1)
      else if (part === '\x03' || part === '\x15') this.reset()
      // eslint-disable-next-line no-control-regex -- control characters are exactly what we're looking for
      else if (/[\x00-\x1f]/.test(part)) this.dirty = true
      else this.typed += part
    }
    return command
  }

  private commit(): string | null {
    const typed = this.typed.trim()
    const dirty = this.dirty
    this.reset()
    if (this.term.buffer.active.type === 'alternate') return null
    const line = this.currentLine()
    let command: string
    if (!dirty && typed) {
      if (!line.includes(typed)) return null // not echoed: a password
      command = typed
    } else {
      command = PROMPT.exec(line) ? line.replace(PROMPT, '').trim() : ''
    }
    return command && command.length <= MAX_LENGTH ? command : null
  }

  private reset(): void {
    this.typed = ''
    this.dirty = false
  }

  /** The cursor's line, joined with the rows it wrapped from. */
  private currentLine(): string {
    const buf = this.term.buffer.active
    let y = buf.baseY + buf.cursorY
    let text = buf.getLine(y)?.translateToString(true) ?? ''
    while (y > 0 && buf.getLine(y)?.isWrapped) {
      y--
      text = (buf.getLine(y)?.translateToString(true) ?? '') + text
    }
    return text.trimEnd()
  }
}
