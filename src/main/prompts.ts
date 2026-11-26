// Questions the main process asks the user while connecting (unknown host key,
// keyboard-interactive / 2FA prompts). The renderer shows them as a dialog.
import { randomUUID } from 'node:crypto'
import type { PromptBody, PromptRequest } from '../shared/types'

export interface PromptEvents {
  show(request: PromptRequest): void
  hide(id: string): void
}

export interface PendingPrompt {
  // Answers in prompt order (empty for a yes/no question); null = canceled.
  answer: Promise<string[] | null>
  cancel: () => void
}

export class Prompter {
  private pending = new Map<string, (answers: string[] | null) => void>()

  constructor(private events: PromptEvents) {}

  ask(body: PromptBody): PendingPrompt {
    const id = randomUUID()
    const answer = new Promise<string[] | null>((resolve) => this.pending.set(id, resolve))
    this.events.show({ ...body, id })
    return { answer, cancel: () => this.settle(id, null) }
  }

  answer(id: string, answers: string[] | null): void {
    this.settle(id, answers)
  }

  private settle(id: string, answers: string[] | null): void {
    const resolve = this.pending.get(id)
    if (!resolve) return
    this.pending.delete(id)
    this.events.hide(id)
    resolve(answers)
  }
}
