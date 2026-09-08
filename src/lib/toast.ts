import { signal } from '@preact/signals'
import type { ControlResult } from './types'
import { t } from './i18n'

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

/**
 * Turn a control-endpoint result envelope into a toast. A missing body (2xx with
 * no JSON) or a result that isn't explicitly a failure counts as success.
 */
export function toastResult(r: ControlResult | undefined, okMsg: string): boolean {
  const failed = !!(r && (r.success === false || (r.error && r.success !== true)))
  if (failed) {
    toast(r!.error || r!.message || t('common.failed'), 'err')
    return false
  }
  toast((r && r.message) || okMsg, 'ok')
  return true
}
