import type { JSX } from 'preact'

interface IconProps { size?: number; class?: string }

function svg(path: JSX.Element, size = 24, cls?: string): JSX.Element {
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

export const IconBell = ({ size, class: c }: IconProps) =>
  svg(<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></>, size, c)

export const IconTrunk = ({ size, class: c }: IconProps) =>
  svg(<><path d="M3 12a9 9 0 0 1 18 0" /><path d="M3 12v6h18v-6" /><path d="M12 3v9" /></>, size, c)

export const IconWind = ({ size, class: c }: IconProps) =>
  svg(<><path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 16h7a2 2 0 1 1-2 2" /></>, size, c)

export const IconSnow = ({ size, class: c }: IconProps) =>
  svg(<><path d="M12 2v20" /><path d="M2 12h20" /><path d="M5 5l14 14" /><path d="M19 5L5 19" /></>, size, c)

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

export const IconPower = ({ size, class: c }: IconProps) =>
  svg(<><path d="M12 3v9" /><path d="M6.6 6.6a8 8 0 1 0 10.8 0" /></>, size, c)

export const IconRefresh = ({ size, class: c }: IconProps) =>
  svg(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>, size, c)

export const IconPlay = ({ size, class: c }: IconProps) =>
  svg(<path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />, size, c)
export const IconPrev = ({ size, class: c }: IconProps) =>
  svg(<><path d="M18 5v14L8 12z" fill="currentColor" stroke="none" /><path d="M6 5v14" /></>, size, c)
export const IconNext = ({ size, class: c }: IconProps) =>
  svg(<><path d="M6 5v14l10-7z" fill="currentColor" stroke="none" /><path d="M18 5v14" /></>, size, c)
export const IconHome = ({ size, class: c }: IconProps) =>
  svg(<><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></>, size, c)
export const IconBack = ({ size, class: c }: IconProps) =>
  svg(<><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>, size, c)
export const IconApp = ({ size, class: c }: IconProps) =>
  svg(<><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></>, size, c)
export const IconLink = ({ size, class: c }: IconProps) =>
  svg(<><path d="M9 15l6-6" /><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" /><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" /></>, size, c)
export const IconCar = ({ size, class: c }: IconProps) =>
  svg(<><path d="M5 11l1.6-4.5A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.5L19 11" /><rect x="3" y="11" width="18" height="6" rx="2" /><circle cx="7.5" cy="17.5" r="1.4" fill="currentColor" stroke="none" /><circle cx="16.5" cy="17.5" r="1.4" fill="currentColor" stroke="none" /></>, size, c)
export const IconBluetooth = ({ size, class: c }: IconProps) =>
  svg(<path d="M6.5 8L17.5 16L12 20.5V3.5L17.5 8L6.5 16" />, size, c)
export const IconQr = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3z" />
      <path d="M20 14v3M17 20h4M14 20v1" />
    </>,
    size,
    c,
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
export const IconGrip = ({ size, class: c }: IconProps) =>
  svg(
    <>
      <circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </>,
    size,
    c,
  )
export const IconFlame = ({ size, class: c }: IconProps) =>
  svg(<path d="M12 3s5 3.6 5 8.5a5 5 0 0 1-10 0c0-1.9 1-3.4 2-4.4 0 .1.4 1.9 1.6 2.4C11 8.6 12 6 12 3z" />, size, c)
export const IconFuel = ({ size, class: c }: IconProps) =>
  svg(<><rect x="4" y="3" width="10" height="18" rx="2" /><path d="M4 10h10" /><path d="M14 7l3.2 3.2a2 2 0 0 1 .6 1.4V17a1.8 1.8 0 0 0 3.2 1.2" /><path d="M18 12v-2" /></>, size, c)
export const IconSnowSeat = ({ size, class: c }: IconProps) =>
  svg(<><path d="M6 4v7a3 3 0 0 0 3 3h4" /><path d="M18 8v10a2 2 0 0 1-2 2H9" /><path d="M9 17v.01" /></>, size, c)
export const IconTrash = ({ size, class: c }: IconProps) =>
  svg(<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></>, size, c)

export const IconMinus = ({ size, class: c }: IconProps) => svg(<path d="M5 12h14" />, size, c)
export const IconPlus = ({ size, class: c }: IconProps) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, size, c)
export const IconArrow = ({ size, class: c }: IconProps) => svg(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>, size, c)
