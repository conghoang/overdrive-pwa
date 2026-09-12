import { batteryKwh, chargeEtaMin, chargeTargetPct } from '../lib/store'
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
const IMG = { w: 1125, h: 540 }
/* The render carries a lot of empty canvas; frame the car itself. */
const VIEW = { x: 60, y: 70, w: 985, h: 420 }

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
 * The wheels are discs: front centre (245,385) r71, rear (825,385) r71,
 * measured off this render's own dark tyre pixels.
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
  x0: 412, // front-left
  x1: 657, // back-right
  backY: 306,
  frontY: 371,
  dx: 34, // horizontal skew from front edge to back edge
  /*
   * Tray thickness. 18% of the pack's height, which is prod's proportion
   * (10 of 57). It was 30 of 79 — 38% — carried over from the sizing used for
   * BYD's pack artwork, which made the slab look like a block rather than a
   * floor panel.
   */
  depth: 14,
}

/*
 * Cell ribbing across the top face. ~20 ribs, counted off BYD's CarSetting
 * battery — the fine ribbing is most of what makes the slab read as a battery
 * rather than a plain green box.
 */
const CELLS = Array.from({ length: 19 }, (_, i) => (i + 1) / 20)

const TOP_FACE = `${PACK.x0 + PACK.dx},${PACK.backY} ${PACK.x1},${PACK.backY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x0},${PACK.frontY}`
const FRONT_FACE = `${PACK.x0},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth} ${PACK.x0},${PACK.frontY + PACK.depth}`
const RIGHT_FACE = `${PACK.x1 - PACK.dx},${PACK.frontY} ${PACK.x1},${PACK.backY} ${PACK.x1},${PACK.backY + PACK.depth} ${PACK.x1 - PACK.dx},${PACK.frontY + PACK.depth}`

/*
 * How far the charge boundary shifts per unit of y.
 *
 * Measured off BYD's own mid-fill frames (24/26/28): their boundary runs at
 * -0.17 in this card's space. The previous value was derived from the DRAWN
 * slab's skew and came out +0.694 — leaning the opposite way to the artwork it
 * now cuts, so the green was visibly not parallel to the pack's edges.
 */
/*
 * The drawn slab is a parallelogram, so its charge boundary runs parallel to
 * its side edges. (The -0.17 used while BYD's pack art was in place came from
 * that artwork's edges; a drawn slab has its own.)
 */
const SKEW = PACK.dx / (PACK.frontY - PACK.backY)
/*
 * The slab's corners are rounded, as on the cluster: a ~15px radius on its
 * 840px pack, which is ~5px at the size drawn here.
 *
 * Rounding each face separately would put a radius on the internal joins too,
 * where the faces meet and nothing should be rounded. Instead the whole slab is
 * clipped by its own OUTLINE — the hexagon around all three faces — with the
 * radius applied there, so only genuinely outer corners are affected.
 */
const CORNER_R = 8

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


/*
 * How far the leading edge travels, measured along the FRONT edge.
 *
 * The drawn slab spans x0..x1 and its top face is pushed right by dx, so the
 * boundary covers x1 - x0 - dx. While BYD's pack image was in place this was
 * the image's full width (x1 + dx - x0) — 34px too far, which let the green run
 * past the slab's right edge and read as over-full at every percentage.
 */
const SPAN = PACK.x1 - PACK.x0 - PACK.dx
const PAD = 40

/** Everything charged so far, cut on the slab's own diagonal. */
function chargedClip(f: number): string {
  const lead = PACK.x0 + SPAN * f
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

/** The remainder — the same cut, closed off to the right. Holds the comets. */
function restClip(f: number): string {
  const lead = PACK.x0 + SPAN * f
  const top = PACK.backY - PAD
  const bot = PACK.frontY + PACK.depth + PAD
  return [
    [lead + PACK.dx + SKEW * PAD, top],
    [CAR_TAIL, top],
    [CAR_TAIL, bot],
    [lead, bot],
    [lead, PACK.frontY],
  ]
    .map((pt) => pt.join(','))
    .join(' ')
}

const COMETS = [
  { t: 0.06, d: -0.10, dur: 2.30, len: 74 },
  { t: 0.14, d: -1.95, dur: 2.75, len: 58 },
  { t: 0.22, d: -1.45, dur: 3.05, len: 52 },
  { t: 0.30, d: -0.48, dur: 2.40, len: 82 },
  { t: 0.36, d: -2.35, dur: 2.90, len: 64 },
  { t: 0.41, d: -0.62, dur: 2.55, len: 88 },
  { t: 0.47, d: -1.20, dur: 3.10, len: 56 },
  { t: 0.16, d: -2.10, dur: 2.85, len: 60 },
  { t: 0.58, d: -0.28, dur: 2.45, len: 70 },
  { t: 0.63, d: -0.95, dur: 2.20, len: 80 },
  { t: 0.69, d: -2.55, dur: 3.00, len: 54 },
  { t: 0.74, d: -1.62, dur: 2.60, len: 76 },
  { t: 0.79, d: -1.85, dur: 3.20, len: 56 },
  { t: 0.85, d: -0.74, dur: 2.35, len: 68 },
  { t: 0.52, d: -2.60, dur: 2.65, len: 70 },
  { t: 0.91, d: -0.35, dur: 2.95, len: 64 },
]
/** Where the car's bodywork ends — the comets enter from here. */
const CAR_TAIL = 1040
const COMET_W = 2.75


// Near-side wheels, measured off the image on a 10-unit grid rather than
// eyeballed — the first pass sat ~16 units high, so the rims floated above the
// discs. They sit almost black against a dark ground once the frame is toned,
// so the app rims them to bring them back.
/* The asset draws its own wheels, so the app no longer rims them. */
const WHEELS: { cx: number; cy: number; r: number }[] = []

/** The SOC figure sits above the slab, overlapping its top face. */
/*
 * Centre of the slab's TOP edge, which is the edge the figure sits on.
 *
 * The slab is a parallelogram: its top edge runs x0+dx .. x1 while its front
 * edge runs x0 .. x1-dx. Averaging x0 and x1 gives the bounding box's centre,
 * which is 17px left of the top edge's — enough to read as misaligned against
 * the edge the digits actually overlap.
 */
const PACK_CX = (PACK.x0 + PACK.dx + PACK.x1) / 2
const PCT_BASELINE = 321




/**
 * Clock time the charge is expected to finish.
 *
 * Deliberately recomputed on every render from the live ETA rather than stored:
 * a remembered timestamp would keep counting down against a stale estimate, and
 * the car revises this figure as the rate changes.
 */
/*
 * Fallback time-to-full, for the window before the car produces its own.
 *
 * OverDrive's etaMin is latched from the vehicle's rest-time reading and from a
 * recorded charging session, so early in a charge — or when the car reports the
 * 255 "unavailable" sentinel — it stays null and the row showed only dashes
 * while a perfectly good power reading sat next to it.
 *
 * kWh remaining / kW = hours. Deliberately NOT corrected for charging losses or
 * the taper near full: this is a placeholder that the real figure replaces as
 * soon as it arrives, and inventing a correction factor would make it look more
 * authoritative than it is. It is always rendered with a "~" for that reason.
 */
function estimateEtaMin(pct: number, kw: number, kwh: number, targetPct: number | null): number | null {
  const target = targetPct != null && targetPct > pct ? targetPct : 100
  const remaining = ((target - pct) / 100) * kwh
  if (remaining <= 0 || kw <= 0.1) return null
  const min = Math.round((remaining / kw) * 60)
  // beyond a day it is noise, not an estimate
  return min > 0 && min < 24 * 60 ? min : null
}

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
  const reportedEta = charging ? chargeEtaMin.value : null
  const target = charging ? chargeTargetPct.value : null
  // Fall back to our own arithmetic only while the car has not given us one.
  const estimated =
    reportedEta == null && charging && pct != null && power != null && batteryKwh.value != null
      ? estimateEtaMin(pct, power, batteryKwh.value, target)
      : null
  const eta = reportedEta ?? estimated
  const etaIsEstimate = reportedEta == null && estimated != null
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

      <svg class="chg-stage" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label={`${label}${pct != null ? ` ${pct}%` : ''}`}>
        <defs>
          {/* Far edge dark, near edge lighter — BYD's direction, not the
              reverse this had. Sampled #0e5a1d -> #289646. */}
          <linearGradient id="chgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--chg-fill-far)" />
            <stop offset="1" stop-color="var(--chg-fill-near)" />
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
          <linearGradient id="chgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--chg-fill-far)" />
            <stop offset="1" stop-color="var(--chg-fill-near)" />
          </linearGradient>
          {/* the slab's own silhouette, so the fill cannot spill past its faces */}
          <clipPath id="chgSlab">
            <polygon points={TOP_FACE} />
            <polygon points={FRONT_FACE} />
            <polygon points={RIGHT_FACE} />
          </clipPath>
          <clipPath id="chgClip">
            {/* Grows with SOC along the slab's diagonal. */}
            <polygon points={chargedClip(frac)} />
          </clipPath>
          <filter id="chgGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>

        <image
          class="chg-car-img"
          href={`${import.meta.env.BASE_URL}car/byd-car.webp`}
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

        {/* battery pack — empty shell, then the charged portion clipped over
            it, the whole assembly clipped by the rounded outline. Drawn rather
            than BYD's own pack art: the drawing keeps the cell ribbing and the
            grey uncharged cells this card is built around. */}
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

          {/* cell dividers, over both states so the grid never breaks */}
          <g class="chg-cells">
            {CELLS.map((f) => {
              const xTop = PACK.x0 + PACK.dx + (PACK.x1 - PACK.x0 - PACK.dx) * f
              const xBot = PACK.x0 + (PACK.x1 - PACK.x0 - PACK.dx) * f
              return <line key={f} x1={xTop} y1={PACK.backY} x2={xBot} y2={PACK.frontY} />
            })}
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

        {/*
          * One text run, so the browser positions the "%" from the digits'
          * real advance width.
          *
          * It used to be a second <text> placed at a hand-computed offset
          * (digits.length * 14 + 5), which is a guess at glyph width: it
          * drifted whenever the font size changed and overlapped the digits
          * outright at "100%". A tspan cannot drift — it flows.
          *
          * The trade-off is that the whole string centres on the pack rather
          * than the digits alone, so the digits sit a few px left of centre.
          * That is far less noticeable than a collision, and it is stable.
          */}
        <text class="chg-num" x={PACK_CX} y={PCT_BASELINE} text-anchor="middle">
          {digits}
          <tspan class="chg-unit">%</tspan>
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
              {eta != null && eta > 0 ? (
                <>
                  {/* "~" marks our own arithmetic, so an estimate is never
                      mistaken for the car's own figure. */}
                  {etaIsEstimate && <span class="chg-approx">~</span>}
                  {fmtEta(eta)}
                </>
              ) : (
                <span class="chg-dash">--</span>
              )}
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
