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
// Measured off the cluster frame: a shallow skew and a thin extrusion, which
// is what makes the cluster's slab read as a flat plate rather than a chunky
// box. Halving dx (34 -> 20) does most of that work.
const PACK = {
  x0: 152, // front-left
  x1: 347, // back-right
  backY: 128,
  frontY: 176,
  dx: 20, // horizontal skew from front edge to back edge
  depth: 10, // extruded thickness
}
const TOP_FACE = `${PACK.x0 + PACK.dx},${PACK.backY} ${PACK.x1},${PACK.backY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x0},${PACK.frontY}`
const FRONT_FACE = `${PACK.x0},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth} ${PACK.x0},${PACK.frontY + PACK.depth}`
const RIGHT_FACE = `${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1},${PACK.backY} ${PACK.x1},${PACK.backY + PACK.depth} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth}`

/**
 * The slab is a parallelogram, so the charge boundary has to run PARALLEL to
 * its side edges — a vertical cut would read as a rectangle laid over an
 * isometric box. SKEW is how far x moves per unit of y along those edges.
 */
const SKEW = PACK.dx / (PACK.frontY - PACK.backY)
/** How far the leading edge travels from empty to full. */
const SPAN = PACK.x1 - PACK.x0 - PACK.dx
const PAD = 26

/** Clip covering everything charged so far, cut on the slab's own diagonal. */
function chargedClip(f: number): string {
  const lead = PACK.x0 + SPAN * f // leading edge, measured at the front edge
  const top = PACK.backY - PAD
  const bot = PACK.frontY + PACK.depth + PAD
  return [
    [PACK.x0 - PAD, top],
    [lead + PACK.dx + SKEW * PAD, top],
    [lead, PACK.frontY],
    [lead, bot],
    [PACK.x0 - PAD, bot],
  ]
    .map((pt) => pt.join(','))
    .join(' ')
}

/** Sweeping highlight, skewed to sit square on the slab like everything else. */
const SHEEN_W = 62
const SHEEN = [
  [PACK.x0 - SHEEN_W + PACK.dx, PACK.backY - 6],
  [PACK.x0 + PACK.dx, PACK.backY - 6],
  [PACK.x0, PACK.frontY + PACK.depth + 6],
  [PACK.x0 - SHEEN_W, PACK.frontY + PACK.depth + 6],
]
  .map((pt) => pt.join(','))
  .join(' ')

// Near-side wheels, read off the image. They sit almost black against a dark
// ground once the frame is toned, so the app rims them to bring them back.
const WHEELS = [
  { cx: 95, cy: 188, r: 40 },
  { cx: 395, cy: 190, r: 40 },
]

/** The SOC figure sits above the slab, overlapping its top face. */
const PACK_CX = (PACK.x0 + PACK.x1) / 2
const PCT_BASELINE = 152

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
  const frac = (pct ?? 0) / 100
  const digits = pct != null ? String(pct) : '--'
  // The summary keeps reporting an estimate for as long as the cable is in, but
  // it only means anything while current is actually flowing — a full or faulted
  // pack has no "time to full".
  const eta = charging ? chargeEtaMin.value : null
  const target = charging ? chargeTargetPct.value : null
  // At 100% both readouts are meaningless — nothing is flowing and there is no
  // time remaining — so the whole row goes rather than showing a pair of
  // dashes. The car can still report charging:true at 100%, so this keys off
  // the SOC as well as the phase.
  const complete = phase === 'full' || pct === 100


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
            <stop offset="0" stop-color="#86d651" />
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
            {/* Grows with SOC along the slab's diagonal; clips all three faces. */}
            <polygon points={chargedClip(frac)} />
          </clipPath>
          <filter id="chgGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>

        <image href={`${import.meta.env.BASE_URL}car/side-wire.webp`} x="0" y="0" width={IMG.w} height={IMG.h} />

        {/* rim the near wheels so they read against the toned-down frame */}
        {WHEELS.map((w) => (
          <g key={w.cx}>
            <circle cx={w.cx} cy={w.cy} r={w.r} class="chg-wheel-glow" filter="url(#chgGlow)" />
            <circle cx={w.cx} cy={w.cy} r={w.r} class="chg-wheel-rim" />
          </g>
        ))}

        {/* battery pack — empty shell, then the charged portion clipped over it */}
        <g class="chg-pack-empty">
          <polygon class="pf-right" points={RIGHT_FACE} />
          <polygon class="pf-front" points={FRONT_FACE} />
          <polygon class="pf-top" points={TOP_FACE} />
        </g>
        <g class="chg-pack-full" clip-path="url(#chgClip)">
          <polygon class="pf-right" points={RIGHT_FACE} />
          <polygon class="pf-front" points={FRONT_FACE} />
          <polygon class="pf-top" points={TOP_FACE} fill="url(#chgFill)" />
          {charging && (
            <polygon class="chg-sheen" points={SHEEN} fill="url(#chgSheen)" />
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

        {/* Matches the cluster: the DIGITS are centred on the pack and the "%"
            hangs off to their right, rather than the whole string being
            centred (which would push the number left of centre). Sits above
            the slab, overlapping its top face, exactly as the original does. */}
        <text class="chg-num" x={PACK_CX} y={PCT_BASELINE} text-anchor="middle">
          {digits}
        </text>
        <text class="chg-unit" x={PACK_CX + digits.length * 14 + 5} y={PCT_BASELINE} text-anchor="start">
          %
        </text>
      </svg>

      {!complete && (
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
      )}
    </div>
  )
}
