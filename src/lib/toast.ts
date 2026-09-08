import { signal } from '@preact/signals'
import type { ControlResult } from './types'

export type ToastKind = 'ok' | 'err' | 'info'
export interface ToastItem { id: number; msg: string; kind: ToastKind }

export const toasts = signal<ToastItem[]>([])
let nextId = 0

export function toast(msg: string, kind: ToastKind = 'info'): void {
  const item: ToastItem = { id: ++nextId, msg, kind }
  toasts.value = [...toasts.value, item]
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== item.id)
  }, 3400)
}

/** Turn a control-endpoint result envelope into a toast. */
export function toastResult(r: ControlResult | undefined, okMsg: string): boolean {
  if (r && r.success) {
    toast(r.message || okMsg, 'ok')
    return true
  }
  toast((r && (r.error || r.message)) || 'Command failed', 'err')
  return false
}
