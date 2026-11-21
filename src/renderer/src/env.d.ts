import type { HarusshApi } from '../../shared/types'

declare global {
  interface Window {
    api: HarusshApi
  }
}

export {}
