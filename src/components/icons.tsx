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

export const IconMinus = ({ size, class: c }: IconProps) => svg(<path d="M5 12h14" />, size, c)
export const IconPlus = ({ size, class: c }: IconProps) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, size, c)
export const IconArrow = ({ size, class: c }: IconProps) => svg(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>, size, c)
