import { chargeEtaMin, chargeTargetPct } from '../lib/store'
import { fmtEta, fmtNum } from '../lib/format'
import { t } from '../lib/i18n'
import { IconBolt, IconPlug } from './icons'
import type { StatusResponse } from '../lib/types'
import { chargingPhase } from '../lib/charging'
import './charging.css'

/*
 * The car is BYD's own artwork, lifted from the head unit rather than redrawn:
 * res/drawable{,-night}-xhdpi/newenergy_flow_car_img_suv in com.byd.carsettings
 * — the ghosted 3/4 outline its energy-flow screen shows while charging. BYD
 * ships it per body style; the Sealion 6 is the SUV.
 *
 * BYD ships a day and a night file, but BOTH are pale strokes on transparency
 * — its energy screen is dark in either theme, the day one merely brighter ink
 * (mean alpha 7.6% vs 5.4%). So there is no dark-ink version to put on a white
 * card, and this card still pins itself dark. The day file is the one used: on
 * a dark ground its wheels and body lines read noticeably crisper.
 */
const IMG = { w: 720, h: 636 }
/** Taller than the image: the pack sits below the car, as it does on the cluster. */
const STAGE = { w: IMG.w, h: 812 }

/*
 * The pack is BYD's artwork too, for the same reason the car is: a drawn slab
 * beside a rendered car looked like two different apps.
 *
 * BYD ships 21 fill levels as separate images. Shipping all of them would add
 * ~292kB to the precache (globPatterns takes every webp) for a 5%-granular
 * result, so only the empty and full frames ride along and the full one is
 * clipped — continuous rather than stepped, and 29kB.
 *
 * The clip follows the slab's own diagonal. Measured off the 21 frames by
 * fitting the fill edge per level, ignoring rows where the fill had already run
 * into the slab's right edge: the boundary is x = C + 1.531*y in the image's
 * own pixel space, with C sweeping -184 (empty) to 226 (full). Reproduces every
 * authored frame to within 6px across a 385px slab.
 */
const SLAB_SRC = { w: 385, h: 275 } // the artwork's own coordinate space
const SLAB_SKEW = 1.531
const SLAB_C0 = -184
const SLAB_C1 = 226
/** Where the slab sits on the stage, under the car. */
const SLAB = { x: 188, y: 596, w: 344 }
const SLAB_H = (SLAB.w * SLAB_SRC.h) / SLAB_SRC.w
const SLAB_SCALE = SLAB.w / SLAB_SRC.w

/** Clip covering everything charged so far, cut on the slab's own diagonal. */
function chargedClip(f: number): string {
  const c = SLAB_C0 + (SLAB_C1 - SLAB_C0) * f
  const pad = 80
  const local: [number, number][] = [
    [-pad, -pad],
    [c + SLAB_SKEW * -pad, -pad],
    [c + SLAB_SKEW * (SLAB_SRC.h + pad), SLAB_SRC.h + pad],
    [-pad, SLAB_SRC.h + pad],
  ]
  return local
    .map(([x, y]) => `${SLAB.x + x * SLAB_SCALE},${SLAB.y + y * SLAB_SCALE}`)
    .join(' ')
}

const PACK_CX = SLAB.x + SLAB.w / 2
const PCT_BASELINE = SLAB.y + SLAB_H * 0.62

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

        <image href={`${import.meta.env.BASE_URL}car/flow-car.webp`} x="0" y="0" width={IMG.w} height={IMG.h} />

        {/*
          Battery pack: BYD's own slab. The empty frame underneath, the full one
          clipped over it — so the charge boundary is continuous instead of the
          21 discrete levels BYD ships, and two images cover every state.
        */}
        <image
          href={`${import.meta.env.BASE_URL}car/pack-empty.webp`}
          x={SLAB.x}
          y={SLAB.y}
          width={SLAB.w}
          height={SLAB_H}
        />
        <g clip-path="url(#chgClip)">
          <image
            href={`${import.meta.env.BASE_URL}car/pack-full.webp`}
            x={SLAB.x}
            y={SLAB.y}
            width={SLAB.w}
            height={SLAB_H}
          />
        </g>

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
