import { fmtPressure, pressureUnitLabel } from '../lib/format'
import { t } from '../lib/i18n'
import type { TyreCorner, TyresState } from '../lib/types'

function abnormal(t: TyreCorner | undefined): boolean {
  if (!t) return false
  return (t.pressureState ?? 0) !== 0 || (t.airLeakState ?? 0) !== 0
}

export function Tyres({ tyres, unit }: { tyres: TyresState | undefined; unit: string }) {
  const available = !!tyres?.available

  function read(key: 'fl' | 'fr' | 'rl' | 'rr') {
    const t = tyres?.[key]
    return (
      <div class={'tyre-read ' + key + (abnormal(t) ? ' warn' : '')}>
        <span class="p mono">{fmtPressure(t, unit)}</span>
        <span class="u">{pressureUnitLabel(unit)}</span>
      </div>
    )
  }

  return (
    <div class="card">
      <div class="card-title">{t('tyre.title')}</div>
      {available ? (
        <div class="tyre-diagram">
          {read('fl')}
          {read('fr')}
          <div class="tyre-car">
            <svg viewBox="0 0 80 150" width="66" aria-hidden="true">
              <rect x="16" y="8" width="48" height="134" rx="20" fill="var(--surface-3)" stroke="var(--border-strong)" stroke-width="1.5" />
              <path d="M26 26 Q40 18 54 26 L54 40 Q40 34 26 40 Z" fill="rgba(120,160,200,0.18)" />
              <rect x="26" y="60" width="28" height="42" rx="8" fill="rgba(120,160,200,0.12)" />
              {/* wheels */}
              <rect x="9" y="26" width="9" height="22" rx="3" fill="#14181d" />
              <rect x="62" y="26" width="9" height="22" rx="3" fill="#14181d" />
              <rect x="9" y="104" width="9" height="22" rx="3" fill="#14181d" />
              <rect x="62" y="104" width="9" height="22" rx="3" fill="#14181d" />
            </svg>
          </div>
          {read('rl')}
          {read('rr')}
        </div>
      ) : (
        <div class="screen-sub">{t('tyre.unavailable')}</div>
      )}
    </div>
  )
}
