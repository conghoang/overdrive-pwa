import { chargeEtaMin, chargeTargetPct } from '../lib/store'
import { fmtEta, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { IconBolt, IconPlug } from './icons'
import type { StatusResponse } from '../lib/types'
import { chargingPhase } from '../lib/charging'
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
 * The car is BYD's own artwork, made TRANSLUCENT the way the cluster draws it.
 *
 * It was a photograph of the cluster screen. That carried its own near-black
 * ground, so on a light card it punched a dark hole and the whole card had to
 * be pinned dark in both themes. This is the real asset instead — chroma-keyed
 * off a flat known background and un-composited — with its alpha then scaled
 * down so the card shows through the body, edges holding more opacity than flat
 * panels so the silhouette still reads. That is what the cluster shows: a glass
 * car, not a solid one.
 *
 * Because it is genuinely transparent it works on either ground, so the card is
 * an ordinary card again and light mode needs no special case.
 *
 * The SVG space IS the image's pixel space (686x375), so the pack coordinates
 * below are read straight off it — no scaling math. The frame keeps a margin on
 * every side: an earlier cut aligned on the tyre line and clipped the roof.
 */
const IMG = { w: 686, h: 375 }
const STAGE = { w: IMG.w, h: IMG.h }

/*
 * Pack geometry. Isometric: the back edge sits higher and right of the front.
 *
 * These are SOLVED, not chosen. Three attempts by eye all failed differently —
 * floating mid-body, hanging below the rocker, then crossing both wheels — so
 * the placement is now searched against two hard constraints, both derived from
 * the asset's own alpha:
 *
 *   1. every slab pixel lies inside the car's silhouette, and
 *   2. no slab pixel falls in a wheel column.
 *
 * The wheels are discs: front centre (142,285) r52, rear (540,285) r54, from
 * their full width at x 90..194 and 487..594.
 *
 * Two things this had to get right. Finding the wheels by "which columns reach
 * below the rocker" is wrong — a circle crossing a line is far wider than the
 * CHORD below it, so that returned 63px for a ~105px wheel and put the slab
 * against the tyres twice.
 *
 * And the clearance is measured as true distance from the slab to each DISC,
 * not as a column gap. Column gaps looked equal while the picture was visibly
 * lopsided, because the parallelogram's skew pulls its bottom-right corner
 * inward: 20.8px to the front wheel against 40.6px to the rear. It is now
 * 28.5px to both.
 *
 * Depth is chosen first and length maximised within it, rather than the other
 * way round: left to maximise area the search trades thickness for length and
 * returns a wafer.
 *
 * Checking the polygon's pixels — rather than one extreme against an average —
 * is what catches an overlap of a dozen pixels, which is plainly visible and
 * which every by-eye pass missed.
 */
const PACK = {
  x0: 220, // front-left
  x1: 482, // back-right
  backY: 190,
  frontY: 247,
  dx: 22, // horizontal skew from front edge to back edge
  depth: 10, // tray thickness — 12% of the pack, measured off the cluster
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
/*
 * The slab's corners are rounded, as on the cluster: a ~15px radius on its
 * 840px pack, which is ~5px at the size drawn here.
 *
 * Rounding each face separately would put a radius on the internal joins too,
 * where the faces meet and nothing should be rounded. Instead the whole slab is
 * clipped by its own OUTLINE — the hexagon around all three faces — with the
 * radius applied there, so only genuinely outer corners are affected.
 */
const CORNER_R = 5

/** Rounded path through a closed list of points. */
function roundedPath(p: number[][], r: number): string {
  const n = p.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = p[(i - 1 + n) % n]
    const cur = p[i]
    const next = p[(i + 1) % n]
    const v1 = [cur[0] - prev[0], cur[1] - prev[1]]
    const v2 = [next[0] - cur[0], next[1] - cur[1]]
    const l1 = Math.hypot(v1[0], v1[1]) || 1
    const l2 = Math.hypot(v2[0], v2[1]) || 1
    // never eat more than half a side, or short edges collapse
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const a = [cur[0] - (v1[0] / l1) * rr, cur[1] - (v1[1] / l1) * rr]
    const b = [cur[0] + (v2[0] / l2) * rr, cur[1] + (v2[1] / l2) * rr]
    d += (i === 0 ? `M ${a[0]},${a[1]}` : ` L ${a[0]},${a[1]}`)
    d += ` Q ${cur[0]},${cur[1]} ${b[0]},${b[1]}`
  }
  return d + ' Z'
}

/** The slab's outer silhouette: top face, then down the rear, back along the tray. */
const SLAB_OUTLINE = roundedPath(
  [
    [PACK.x0 + PACK.dx, PACK.backY],
    [PACK.x1, PACK.backY],
    [PACK.x1, PACK.backY + PACK.depth],
    [PACK.x1 - PACK.dx, PACK.frontY + PACK.depth],
    [PACK.x0, PACK.frontY + PACK.depth],
    [PACK.x0, PACK.frontY],
  ],
  CORNER_R,
)

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

/**
 * The UNCHARGED remainder — the same cut, closed off to the right instead.
 * The comets live in here, so they vanish exactly at the charge boundary rather
 * than crossing onto the green.
 */
function restClip(f: number): string {
  const lead = PACK.x0 + SPAN * f
  const top = PACK.backY - PAD
  const bot = PACK.frontY + PACK.depth + PAD
  /*
   * Out to the car's TAIL, not the pack's rear edge.
   *
   * The charge arrives from behind the vehicle, so the comets have to exist
   * over the body before they reach the pack. Clipping this region to the pack
   * meant they could only ever appear once already inside it, which read as
   * charge spawning in the battery rather than flowing into it.
   */
  const right = CAR_TAIL
  return [
    [lead + PACK.dx + SKEW * PAD, top],
    [right, top],
    [right, bot],
    [lead, bot],
    [lead, PACK.frontY],
  ]
    .map((pt) => pt.join(','))
    .join(' ')
}

/*
 * Charge comets: streaks that fly forward out of the rear of the pack and die
 * at the charge boundary, as the cluster shows while current is flowing.
 *
 * One per cell row, each offset in time so they do not read as a single moving
 * bar. They are drawn along the pack's own diagonal so they travel with the
 * cells rather than across them.
 */
/*
 * Eight, not five, and each travels only about the pack's own length.
 *
 * The first pass sent five comets across a 370px path while the uncharged
 * window at a typical charge is only ~85px wide, so each was visible for under
 * a quarter of its cycle and barely one showed at a time. Density is what makes
 * this read as a stream.
 */
const COMETS = [
  { t: 0.08, d: -0.10, dur: 2.30, len: 74 },
  { t: 0.27, d: -1.45, dur: 3.05, len: 52 },
  { t: 0.41, d: -0.62, dur: 2.55, len: 88 },
  { t: 0.16, d: -2.10, dur: 2.85, len: 60 },
  { t: 0.63, d: -0.95, dur: 2.20, len: 80 },
  { t: 0.79, d: -1.85, dur: 3.20, len: 56 },
  { t: 0.52, d: -2.60, dur: 2.65, len: 70 },
  { t: 0.91, d: -0.35, dur: 2.95, len: 64 },
]
/** Where the car's bodywork ends — the comets enter from here. */
const CAR_TAIL = 664
const COMET_W = 3.4


// Near-side wheels, measured off the image on a 10-unit grid rather than
// eyeballed — the first pass sat ~16 units high, so the rims floated above the
// discs. They sit almost black against a dark ground once the frame is toned,
// so the app rims them to bring them back.
/* The asset draws its own wheels, so the app no longer rims them. */
const WHEELS: { cx: number; cy: number; r: number }[] = []

/** The SOC figure sits above the slab, overlapping its top face. */
const PACK_CX = (PACK.x0 + PACK.x1) / 2
const PCT_BASELINE = 203

/*
 * Cell ribbing across the top face.
 *
 * Counted off BYD's own battery (newenergy_flow_battery_level_*, CarSetting):
 * ~20 ribs across a 333px face, not the three dividers this had. The fine
 * ribbing is most of what makes their slab read as a battery rather than a
 * plain green box, so the count matters.
 */
const CELLS = Array.from({ length: 19 }, (_, i) => (i + 1) / 20)



/**
 * Clock time the charge is expected to finish.
 *
 * Deliberately recomputed on every render from the live ETA rather than stored:
 * a remembered timestamp would keep counting down against a stale estimate, and
 * the car revises this figure as the rate changes.
 */
function fullAt(etaMin: number): string {
  const d = new Date(Date.now() + etaMin * 60_000)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function ChargingCard({ s, atTop = false }: { s: StatusResponse; atTop?: boolean }) {
  const phase = chargingPhase(s)
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
    <div
      class={
        'card chg-card' +
        (atTop ? ' at-top' : '') +
        (charging ? ' charging' : '') +
        (phase === 'fault' ? ' fault' : '')
      }
    >
      <div class="chg-status">
        <IconPlug size={16} />
        <span>{label}</span>
      </div>

      <svg class="chg-stage" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} role="img" aria-label={`${label}${pct != null ? ` ${pct}%` : ''}`}>
        <defs>
          {/* Far edge dark, near edge lighter — BYD's direction, not the
              reverse this had. Sampled #0e5a1d -> #289646. */}
          <linearGradient id="chgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0e5a1d" />
            <stop offset="1" stop-color="#2fa350" />
          </linearGradient>
          {/* Brushed-metal rim. Not a flat white line: a light-dark-light ramp
              across the edge is what reads as a machined casing rather than an
              outline, which is how the real tray catches the light. */}
          <linearGradient id="chgMetal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="0.45" stop-color="#e8eef2" />
            <stop offset="0.62" stop-color="#9fb0bb" />
            <stop offset="1" stop-color="#f2f6f9" />
          </linearGradient>
          <linearGradient id="chgEmptyTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#4c4c4c" />
            <stop offset="1" stop-color="#7a7a7a" />
          </linearGradient>
          {/* The slab's own silhouette. The charge clip below is a padded
              half-plane, so on its own it lets the sweeping light spill above
              and below the block; nesting the two intersects them and keeps
              the light strictly inside the green. */}
          <clipPath id="chgRound">
            <path d={SLAB_OUTLINE} />
          </clipPath>
          <clipPath id="chgSlab">
            <polygon points={TOP_FACE} />
            <polygon points={FRONT_FACE} />
            <polygon points={RIGHT_FACE} />
          </clipPath>
          {/* bright head, fading tail — a comet, not a dash */}
          {/* The comets travel LEFT, so the bright head is at offset 0 (their
              leading edge) and the tail fades behind them to the right. It was
              the other way round, which flew them tail-first. */}
          <linearGradient id="chgComet" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="var(--chg-comet-head)" stop-opacity="1" />
            <stop offset="0.4" stop-color="var(--chg-comet-mid)" stop-opacity="0.68" />
            <stop offset="1" stop-color="var(--chg-comet-tail)" stop-opacity="0" />
          </linearGradient>
          <clipPath id="chgRest">
            <polygon points={restClip(frac)} />
          </clipPath>
          <clipPath id="chgClip">
            {/* Grows with SOC along the slab's diagonal; clips all three faces. */}
            <polygon points={chargedClip(frac)} />
          </clipPath>
          <filter id="chgGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>

        <image
          class="chg-car-img"
          href={`${import.meta.env.BASE_URL}car/car-glass.webp`}
          x="0"
          y="0"
          width={IMG.w}
          height={IMG.h}
        />

        {/* rim the near wheels so they read against the toned-down frame */}
        {WHEELS.map((w) => (
          <g key={w.cx}>
            <circle cx={w.cx} cy={w.cy} r={w.r} class="chg-wheel-glow" filter="url(#chgGlow)" />
            <circle cx={w.cx} cy={w.cy} r={w.r} class="chg-wheel-rim" />
          </g>
        ))}

        {/* battery pack — empty shell, then the charged portion clipped over it.
            The whole assembly is clipped by the rounded outline. */}
        <g clip-path="url(#chgRound)">
        <g class="chg-pack-empty">
          <polygon class="pf-right" points={RIGHT_FACE} />
          <polygon class="pf-front" points={FRONT_FACE} />
          <polygon class="pf-top" points={TOP_FACE} />
        </g>
        <g clip-path="url(#chgSlab)">
        <g class="chg-pack-full" clip-path="url(#chgClip)">
          <polygon class="pf-right" points={RIGHT_FACE} />
          <polygon class="pf-front" points={FRONT_FACE} />
          <polygon class="pf-top" points={TOP_FACE} fill="url(#chgFill)" />
        </g>
        </g>

        {/* cell dividers, drawn over both states so the grid never breaks */}
        <g class="chg-cells">
          {CELLS.map((f) => {
            const xTop = PACK.x0 + PACK.dx + (PACK.x1 - PACK.x0 - PACK.dx) * f
            const xBot = PACK.x0 + (PACK.x1 - PACK.x0 - PACK.dx) * f
            return <line key={f} x1={xTop} y1={PACK.backY} x2={xBot} y2={PACK.frontY} />
          })}
          {/* No lengthwise centre line. This is a Blade pack: the cells run the
              full width of the tray in one piece, so a line down the middle
              would draw a split the battery does not have. */}
        </g>

        </g>

        {charging && (
          <g class="chg-comets" clip-path="url(#chgRest)">
            {COMETS.map((c) => {
              // position across the top face, following its diagonal
              const y = PACK.backY + (PACK.frontY - PACK.backY) * c.t
              const x = PACK.x0 + PACK.dx * (1 - c.t)
              /*
               * A RECT, not a line. A horizontal <line> has a zero-height
               * bounding box, and a gradient in objectBoundingBox units cannot
               * resolve against zero area — the stroke silently paints nothing,
               * which is exactly how these first shipped: invisible, not static.
               */
              return (
                <rect
                  key={c.t}
                  x={x}
                  y={y - COMET_W / 2}
                  width={c.len}
                  height={COMET_W}
                  rx={COMET_W / 2}
                  style={`animation-delay:${c.d}s;animation-duration:${c.dur}s`}
                />
              )
            })}
          </g>
        )}

        {/* A hairline where the faces meet, so the tray reads as a separate
            piece from the cells. The tray itself is the extruded faces. */}
        <g class="chg-rim">
          {/* the outline follows the rounded silhouette; the inner edge where
              cells meet tray stays straight, because it is a real crease */}
          <path d={SLAB_OUTLINE} />
          <polygon points={FRONT_FACE} />
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

      {/* Three columns, two lines: label row then value row. The finish time
          gets a column of its own rather than trailing the countdown, which was
          cramming two separate readings into one cell. */}
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
          <div class="chg-stat mid">
            <div class="chg-stat-head">
              {t('chg.eta_short')}
              {target != null && target > 0 && target < 100 ? ` · ${target}%` : ''}
            </div>
            <div class="chg-stat-value mono">
              {eta != null && eta > 0 ? fmtEta(eta) : <span class="chg-dash">--</span>}
            </div>
          </div>
          <div class="chg-stat right">
            <div class="chg-stat-head">{t('chg.full_at')}</div>
            <div class="chg-stat-value mono">
              {eta != null && eta > 0 ? fullAt(eta) : <span class="chg-dash">--</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
