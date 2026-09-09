import { chargeEtaMin, chargeTargetPct } from '../lib/store'
import { fmtEta, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { IconBolt, IconPlug } from './icons'
import type { StatusResponse } from '../lib/types'
import './charging.css'

/**
 * Charging card modelled on the BYD instrument cluster's charge screen: the car
 * as a wireframe outline, the traction pack drawn as an isometric slab that
 * fills green with the state of charge, and power / time-to-full underneath.
 *
 * Every value is live — SOC from /status, power from the charging block, and
 * time-to-full from the launcher summary (only polled while plugged in).
 */

// Pack geometry in SVG user units. The slab is an isometric parallelogram:
// going from the back edge to the front edge shifts left and down.
const PACK = {
  x0: 126, // left extent (front-face left edge)
  x1: 294, // right extent (back-face right edge)
  backY: 103,
  frontY: 132,
  dx: 24, // horizontal skew from front edge to back edge
  depth: 10, // extruded thickness
}
// Wheels sit outboard of the pack, so they're drawn over it — which also hides
// where the slab runs past the axles, exactly as the cluster screen does.
const WHEELS = [112, 304]
const WHEEL_R = 32
const WHEEL_Y = 136
const TOP_FACE = `${PACK.x0 + PACK.dx},${PACK.backY} ${PACK.x1},${PACK.backY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x0},${PACK.frontY}`
const FRONT_FACE = `${PACK.x0},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth} ${PACK.x0},${PACK.frontY + PACK.depth}`
const RIGHT_FACE = `${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1},${PACK.backY} ${PACK.x1},${PACK.backY + PACK.depth} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth}`

// Long-roof SUV silhouette, authored to be STROKED rather than filled so the
// pack reads as sitting inside the car. Picked by rendering candidates side by
// side; the wheel arches are cut into the sill and then covered by the wheels.
const BODY =
  'M20 118 C20 102 24 92 34 84 C46 74 56 60 70 52 C82 45 98 41 120 40 ' +
  'L266 40 C290 41 306 50 318 64 C326 74 334 82 348 86 L372 94 ' +
  'C386 99 392 108 392 120 L392 136 L336 136 A32 32 0 0 0 272 136 ' +
  'L144 136 A32 32 0 0 0 80 136 L28 136 C22 136 20 130 20 118 Z'
const GREENHOUSE = 'M86 84 C96 62 112 50 134 49 L254 48 C274 49 290 60 300 82 Z'
const B_PILLAR = 'M186 48 L186 83'

/** Cell divider lines across the top face, as fractions along its length. */
const CELLS = [0.25, 0.5, 0.75]

type Phase = 'charging' | 'full' | 'fault' | 'plugged'

function phaseOf(s: StatusResponse): Phase | null {
  const c = s.charging
  if (!c) return null
  if (c.fault) return 'fault'
  if (c.charging) return 'charging'
  if (c.full) return 'full'
  if (c.plugged) return 'plugged'
  return null
}

export function ChargingCard({ s }: { s: StatusResponse }) {
  const phase = phaseOf(s)
  if (!phase) return null // not plugged in — the card has nothing to say

  const soc = s.soc?.percent
  const pct = typeof soc === 'number' ? Math.max(0, Math.min(100, Math.round(soc))) : null
  const power = s.charging?.chargingPowerKW ?? s.charging?.powerKw
  const charging = phase === 'charging'
  // The summary keeps reporting an estimate for as long as the cable is in, but
  // it only means anything while current is actually flowing — a full or faulted
  // pack has no "time to full".
  const eta = charging ? chargeEtaMin.value : null
  const target = charging ? chargeTargetPct.value : null

  const fillW = ((pct ?? 0) / 100) * (PACK.x1 - PACK.x0)

  const label =
    phase === 'charging' ? t('chg.charging')
    : phase === 'full' ? t('chg.full')
    : phase === 'fault' ? t('chg.fault')
    : t('chg.plugged')

  return (
    <div class={'card chg-card' + (charging ? ' charging' : '') + (phase === 'fault' ? ' fault' : '')}>
      <div class="chg-status">
        <IconPlug size={16} />
        <span>{label}</span>
      </div>

      <svg class="chg-stage" viewBox="0 0 400 200" role="img" aria-label={`${label}${pct != null ? ` ${pct}%` : ''}`}>
        <defs>
          <linearGradient id="chgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#7ee06a" />
            <stop offset="1" stop-color="#34b83c" />
          </linearGradient>
          {/* sweeping highlight — only ever visible over the charged portion,
              because it lives inside the same clip */}
          <linearGradient id="chgSheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0.4" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <clipPath id="chgClip">
            {/* Grows left-to-right with SOC; clips all three pack faces at once. */}
            <rect x={PACK.x0} y="90" width={fillW} height="70" />
          </clipPath>
        </defs>

        {/* wireframe car */}
        <g class="chg-wire" fill="none" stroke-linejoin="round" stroke-linecap="round">
          <path d={BODY} stroke-width="2.4" />
          <path d={GREENHOUSE} stroke-width="1.5" opacity="0.62" />
          <path d={B_PILLAR} stroke-width="1.5" opacity="0.62" />
        </g>

        {/* battery pack — empty shell, then the charged portion clipped over it */}
        <g class="chg-pack-empty">
          <polygon points={RIGHT_FACE} />
          <polygon points={FRONT_FACE} />
          <polygon points={TOP_FACE} />
        </g>
        <g clip-path="url(#chgClip)">
          <polygon points={RIGHT_FACE} fill="#2e9e34" />
          <polygon points={FRONT_FACE} fill="#2a8f30" />
          <polygon points={TOP_FACE} fill="url(#chgFill)" />
          {charging && (
            <rect class="chg-sheen" x={PACK.x0 - 54} y={PACK.backY - 2} width="54" height="48" fill="url(#chgSheen)" />
          )}
        </g>

        {/* cell dividers, drawn over both states so the grid never breaks */}
        <g class="chg-cells">
          {CELLS.map((f) => {
            const xTop = PACK.x0 + PACK.dx + (PACK.x1 - PACK.x0 - PACK.dx) * f
            const xBot = PACK.x0 + (PACK.x1 - PACK.x0 - PACK.dx) * f
            return <line key={f} x1={xTop} y1={PACK.backY} x2={xBot} y2={PACK.frontY} />
          })}
          <line
            x1={PACK.x0 + PACK.dx / 2}
            y1={(PACK.backY + PACK.frontY) / 2}
            x2={PACK.x1 - PACK.dx / 2}
            y2={(PACK.backY + PACK.frontY) / 2}
          />
        </g>

        {WHEELS.map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={WHEEL_Y} r={WHEEL_R} class="chg-tyre" />
            <circle cx={cx} cy={WHEEL_Y} r="13" class="chg-hub" />
          </g>
        ))}

        <text class="chg-pct" x={(PACK.x0 + PACK.x1) / 2} y="134" text-anchor="middle">
          {pct != null ? pct : '--'}
          <tspan class="chg-pct-unit" dx="3">%</tspan>
        </text>
      </svg>

      <div class="chg-stats">
        <div class="chg-stat">
          <div class="chg-stat-head">
            <IconBolt size={13} /> {t('chg.power')}
          </div>
          <div class="chg-stat-value mono">
            {power != null ? fmtNum(power, 1) : '--'}
            <small> kW</small>
          </div>
        </div>
        <div class="chg-stat right">
          <div class="chg-stat-head">
            {t('chg.eta')}
            {target != null && target > 0 && target < 100 ? ` · ${target}%` : ''}
          </div>
          <div class="chg-stat-value mono">
            {eta != null && eta > 0 ? fmtEta(eta) : <span class="chg-dash">--</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
