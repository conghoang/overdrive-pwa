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

/*
 * The car is an image, not a drawing: `public/car/side-wire.webp` is the
 * wireframe from the cluster's own charge screen, with its baked-in battery
 * slab and "41%" erased so this app can draw them live instead.
 *
 * The SVG coordinate space IS the image's pixel space (520x246), so the pack
 * coordinates below are read straight off the photo — no scaling math.
 */
const IMG = { w: 520, h: 246 }

// Pack geometry, matched to where the slab sat in the original frame. The slab
// is isometric: the back edge is higher and shifted right of the front edge.
const PACK = {
  x0: 150, // front-left
  x1: 352, // back-right
  backY: 126,
  frontY: 168,
  dx: 34, // horizontal skew from front edge to back edge
  depth: 14, // extruded thickness
}
const TOP_FACE = `${PACK.x0 + PACK.dx},${PACK.backY} ${PACK.x1},${PACK.backY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x0},${PACK.frontY}`
const FRONT_FACE = `${PACK.x0},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth} ${PACK.x0},${PACK.frontY + PACK.depth}`
const RIGHT_FACE = `${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1},${PACK.backY} ${PACK.x1},${PACK.backY + PACK.depth} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth}`

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

      <svg class="chg-stage" viewBox={`0 0 ${IMG.w} ${IMG.h}`} role="img" aria-label={`${label}${pct != null ? ` ${pct}%` : ''}`}>
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
            <rect x={PACK.x0} y={PACK.backY - 8} width={fillW} height="80" />
          </clipPath>
        </defs>

        <image href={`${import.meta.env.BASE_URL}car/side-wire.webp`} x="0" y="0" width={IMG.w} height={IMG.h} />

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
            <rect class="chg-sheen" x={PACK.x0 - 60} y={PACK.backY - 6} width="60" height="70" fill="url(#chgSheen)" />
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

        <text class="chg-pct" x={(PACK.x0 + PACK.x1) / 2} y="163" text-anchor="middle">
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
