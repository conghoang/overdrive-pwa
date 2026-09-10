import { useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { t } from '../lib/i18n'
import {
  DEFAULT_WC_COMMANDS,
  newCommandId,
  resetCommands,
  saveCommands,
  wcCommands,
  type WcCommand,
  type WcKind,
} from '../lib/settings'
import { ICON_KEYS, iconFor, iconLabel, useEscape } from './WiCarlinkControls'
import { IconBack, IconGrip, IconPlus, IconTrash } from './icons'
import './controls.css'

/** Full-screen editor: add / remove / reorder / edit 51DK command buttons. */
export function WiCarlinkEditor({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<WcCommand[]>(() => wcCommands.value.map((c) => ({ ...c })))
  const [dragId, setDragId] = useState<string | null>(null)
  const [iconPickFor, setIconPickFor] = useState<string | null>(null)
  useEscape(iconPickFor ? () => setIconPickFor(null) : null)
  const rowEls = useRef<Record<string, HTMLElement | null>>({})
  const dragging = useRef<string | null>(null)

  function update(id: string, patch: Partial<WcCommand>) {
    setDraft((d) => d.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function remove(id: string) {
    setDraft((d) => d.filter((c) => c.id !== id))
  }

  // --- pointer-based drag reorder (touch-friendly) ---
  function reorderTo(y: number) {
    const id = dragging.current
    if (id == null) return
    setDraft((d) => {
      const from = d.findIndex((c) => c.id === id)
      if (from < 0) return d
      let target = d.length - 1
      for (let i = 0; i < d.length; i++) {
        const el = rowEls.current[d[i].id]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (y < r.top + r.height / 2) {
          target = i
          break
        }
      }
      if (target === from) return d
      const copy = d.slice()
      const [item] = copy.splice(from, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }
  function onDragStart(e: JSX.TargetedPointerEvent<HTMLElement>, id: string) {
    e.preventDefault()
    dragging.current = id
    setDragId(id)
  }
  // While dragging, listen on the window so moves off the handle still track.
  useEffect(() => {
    if (dragId == null) return
    const move = (e: PointerEvent) => reorderTo(e.clientY)
    const end = () => {
      dragging.current = null
      setDragId(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  function add() {
    setDraft((d) => [
      ...d,
      { id: newCommandId(), label: t('wc.new_button'), kind: 'shell', value: '', icon: 'app' },
    ])
  }
  function save() {
    const cleaned = draft
      .map((c) => ({ ...c, label: c.label.trim(), value: c.value.trim() }))
      .filter((c) => c.label && c.value)
    saveCommands(cleaned.length ? cleaned : DEFAULT_WC_COMMANDS.map((c) => ({ ...c })))
    onDone()
  }

  return (
    <div>
      <div class="screen-head">
        <div>
          <h1 class="screen-title">{t('wc.edit_title')}</h1>
          <div class="screen-sub">{t('wc.edit_sub')}</div>
        </div>
        <button class="btn ghost" style={{ padding: '8px 12px' }} onClick={onDone}>
          <IconBack size={18} /> {t('wc.back')}
        </button>
      </div>

      <div class="card">
        {draft.map((c) => {
          const RowIcon = iconFor(c.icon)
          return (
            <div
              class={'wc-edit-row' + (dragId === c.id ? ' dragging' : '')}
              key={c.id}
              ref={(el) => {
                rowEls.current[c.id] = el
              }}
            >
              <button class="wc-grip" aria-label={t('wc.drag')} onPointerDown={(e) => onDragStart(e, c.id)}>
                <IconGrip size={20} />
              </button>
              <div class="wc-edit-fields">
                <div class="wc-row-top">
                  <button
                    type="button"
                    class="wc-icon-btn"
                    aria-label={t('wc.change_icon')}
                    onClick={() => setIconPickFor(c.id)}
                  >
                    <RowIcon size={20} />
                  </button>
                  <input
                    class="wc-input"
                    value={c.label}
                    placeholder={t('wc.label_ph')}
                    onInput={(e) => update(c.id, { label: (e.target as HTMLInputElement).value })}
                  />
                  <select
                    class="wc-kind"
                    value={c.kind}
                    onChange={(e) => update(c.id, { kind: (e.target as HTMLSelectElement).value as WcKind })}
                  >
                    <option value="openApp">{t('wc.kind_app')}</option>
                    <option value="shell">{t('wc.kind_shell')}</option>
                  </select>
                </div>
                <input
                  class="wc-input mono"
                  value={c.value}
                  placeholder={c.kind === 'openApp' ? 'com.package.name' : 'am start -n …'}
                  onInput={(e) => update(c.id, { value: (e.target as HTMLInputElement).value })}
                />
              </div>
              <button class="wc-del" onClick={() => remove(c.id)} aria-label={t('wc.remove')}>
                <IconTrash size={20} />
              </button>
            </div>
          )
        })}
        <button class="btn block" style={{ marginTop: '12px' }} onClick={add}>
          <IconPlus size={18} /> {t('wc.add')}
        </button>
      </div>

      <div class="card" style={{ marginTop: '14px' }}>
        <p class="wc-note" style={{ marginBottom: '12px' }}>{t('wc.shell_note')}</p>
        <button class="btn accent block" onClick={save}>{t('wc.save')}</button>
        <div class="grid grid-2" style={{ marginTop: '10px' }}>
          <button class="btn" onClick={onDone}>{t('wc.cancel')}</button>
          <button
            class="btn danger"
            onClick={() => {
              resetCommands()
              onDone()
            }}
          >
            {t('wc.reset')}
          </button>
        </div>
      </div>

      {iconPickFor && (
        <div class="modal-backdrop" onClick={() => setIconPickFor(null)}>
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wc-icon-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="modal-title" id="wc-icon-title">{t('wc.choose_icon')}</h3>
            <div class="icon-grid">
              {ICON_KEYS.map((k) => {
                const Ico = iconFor(k)
                const on = draft.find((c) => c.id === iconPickFor)?.icon === k
                return (
                  <button
                    key={k}
                    type="button"
                    class={'icon-cell' + (on ? ' on' : '')}
                    // aria-label was the raw ICON_KEYS token ('bolt', 'sliders'),
                    // i.e. developer English read aloud to a Vietnamese user, and
                    // the chosen cell was marked by background colour only.
                    aria-label={iconLabel(k)}
                    aria-pressed={on}
                    onClick={() => {
                      update(iconPickFor, { icon: k })
                      setIconPickFor(null)
                    }}
                  >
                    <Ico size={22} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
