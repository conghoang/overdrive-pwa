import type { JSX } from 'preact'

export interface IconProps { size?: number; class?: string }

export function svg(path: JSX.Element, size = 24, cls?: string): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cls}
    >
      {path}
    </svg>
  )
}

export const IconGauge = ({ size, class: c }: IconProps) =>
  svg(<><path d="M12 14l4-4" /><path d="M4.9 19a9 9 0 1 1 14.2 0" /><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" /></>, size, c)

export const IconSliders = ({ size, class: c }: IconProps) =>
  svg(<><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h2" /><path d="M10 12h10" /><circle cx="8" cy="12" r="2" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="18" r="2" /></>, size, c)

export const IconUser = ({ size, class: c }: IconProps) =>
  svg(<><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>, size, c)

export const IconLock = ({ size, class: c }: IconProps) =>
  svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, size, c)

export const IconUnlock = ({ size, class: c }: IconProps) =>
  svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>, size, c)

export const IconBolt = ({ size, class: c }: IconProps) =>
  svg(<path d="M13 3L4 14h6l-1 7 9-11h-6z" />, size, c)

export const IconTrunk = ({ size, class: c }: IconProps) =>
  svg(<><path d="M3 12a9 9 0 0 1 18 0" /><path d="M3 12v6h18v-6" /><path d="M12 3v9" /></>, size, c)

export const IconWind = ({ size, class: c }: IconProps) =>
  svg(<><path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 16h7a2 2 0 1 1-2 2" /></>, size, c)

export const IconWindow = ({ size, class: c }: IconProps) =>
  svg(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16" /><path d="M12 4v16" /></>, size, c)

export const IconPlug = ({ size, class: c }: IconProps) =>
  svg(<><path d="M9 2v6" /><path d="M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></>, size, c)

export const IconWifi = ({ size, class: c }: IconProps) =>
  svg(<><path d="M2 8.5a16 16 0 0 1 20 0" /><path d="M5 12a11 11 0 0 1 14 0" /><path d="M8.5 15.5a6 6 0 0 1 7 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>, size, c)

export const IconThermo = ({ size, class: c }: IconProps) =>
  svg(<><path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z" /></>, size, c)

export const IconPin = ({ size, class: c }: IconProps) =>
  svg(<><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>, size, c)

export const IconMapOpen = ({ size = 24, class: c }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={c}>
    <path
      d="M12 2.2c-3.9 0-7 3.1-7 7 0 5.1 6.2 12 6.5 12.3a.7.7 0 0 0 1 0c.3-.3 6.5-7.2 6.5-12.3 0-3.9-3.1-7-7-7z"
      fill="#EA4335"
    />
    <path d="M12 2.2c-2.2 0-4.2 1-5.5 2.6l7.7 6.5a7 7 0 0 0 4.8-2.1c0-3.9-3.1-7-7-7z" fill="#FBBC04" opacity="0.85" />
    <circle cx="12" cy="9.2" r="2.7" fill="#fff" />
  </svg>
)

export const IconGear = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.3V6 M12 18v2.7 M20.7 12H18 M6 12H3.3 M18.1 5.9l-1.9 1.9 M7.8 16.2l-1.9 1.9 M18.1 18.1l-1.9-1.9 M7.8 7.8 5.9 5.9" />
    </>,
    size,
    c,
  )
export const IconFuel = ({ size, class: c }: IconProps) =>
  svg(<><rect x="4" y="3" width="10" height="18" rx="2" /><path d="M4 10h10" /><path d="M14 7l3.2 3.2a2 2 0 0 1 .6 1.4V17a1.8 1.8 0 0 0 3.2 1.2" /><path d="M18 12v-2" /></>, size, c)
/* Horizontal cell with a terminal nub and a bolt — reads as a traction battery
   next to IconFuel's pump, which is the pairing it exists for. */
export const IconBattery = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <rect x="2" y="7" width="17" height="10" rx="2.5" />
      <path d="M21.5 10.5v3" />
      <path d="M11.6 9.4L8.9 13h3.2l-.7 2.6L14.6 12h-3.2z" fill="currentColor" stroke="none" />
    </>,
    size,
    c,
  )

/* Bars of differing height — statistics, distinct from IconGauge's live dial. */
export const IconChart = ({ size, class: c }: IconProps) =>
  svg(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>, size, c)

export const IconSnowSeat = ({ size, class: c }: IconProps) =>
  svg(<><path d="M6 4v7a3 3 0 0 0 3 3h4" /><path d="M18 8v10a2 2 0 0 1-2 2H9" /><path d="M9 17v.01" /></>, size, c)
export const IconSun = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" />
    </>,
    size,
    c,
  )
export const IconMoon = ({ size, class: c }: IconProps) =>
  svg(<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />, size, c)
/** System: one disc, half filled — reads as "follows whatever the phone does". */
export const IconThemeAuto = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none" />
    </>,
    size,
    c,
  )

export const IconCamera = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <path d="M4 8h3l1.4-2h7.2L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.6" />
    </>,
    size,
    c,
  )

/** Air quality: drifting particulates. */
export const IconAir = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <path d="M3 9h10a2.6 2.6 0 1 0-2.6-2.6" />
      <path d="M3 14h13a2.6 2.6 0 1 1-2.6 2.6" />
      <circle cx="18.5" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="7" cy="19" r="1.3" fill="currentColor" stroke="none" />
    </>,
    size,
    c,
  )
