import { useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { t } from '../lib/i18n'
import { commitFeedback, tapFeedback } from '../lib/haptics'

interface Props {
  label: string
  icon?: JSX.Element
  /** If true, requires a press-and-hold to fire (sensitive actions). */
  hold?: boolean
  tone?: 'default' | 'accent' | 'danger'
  disabled?: boolean
  onFire: () => void | Promise<void>
}

const HOLD_MS = 900

/**
 * Remote-action button. Tap to fire, or (when `hold`) press-and-hold with a
 * radial progress fill before it commits — for sensitive actions like unlock.
 */
export function ActionButton({ label, icon, hold, tone = 'default', disabled, onFire }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)
  const startTs = useRef(0)
  const fired = useRef(false)

  async function fire() {
    if (busy || disabled) return
    setBusy(true)
    try {
      await onFire()
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  function tick() {
    const elapsed = performance.now() - startTs.current
    const p = Math.min(1, elapsed / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      fired.current = true
      commitFeedback()
      cancelHold()
      fire()
    } else {
      raf.current = requestAnimationFrame(tick)
    }
  }

  function cancelHold() {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
  }

  function onDown(e: JSX.TargetedPointerEvent<HTMLButtonElement>) {
    if (disabled || busy) return
    tapFeedback()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (!hold) return
    fired.current = false
    startTs.current = performance.now()
    raf.current = requestAnimationFrame(tick)
  }

  function onUp() {
    if (!hold) return
    cancelHold()
    if (!fired.current) setProgress(0)
  }

  return (
    <button
      class={`action tone-${tone}` + (busy ? ' busy' : '')}
      disabled={disabled || busy}
      onClick={hold ? undefined : fire}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {hold && progress > 0 && (
        <span class="action-fill" style={{ transform: `scaleX(${progress})` }} />
      )}
      <span class="action-icon">{icon}</span>
      <span class="action-label">{label}</span>
      {hold && <span class="action-hint">{t('ctrl.hold')}</span>}
    </button>
  )
}
