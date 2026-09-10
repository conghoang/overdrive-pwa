import { svg, type IconProps } from './icons'

/*
 * Icons no screen in the app shell uses.
 *
 * They live apart from icons.tsx purely for chunking: a module is the unit
 * rollup places, so while all 46 shared one file, the 22 that only the lazy
 * screens touch were hoisted into the entry along with the rest. Split, they
 * ride with the chunks that actually need them.
 *
 * The rule for which file an icon belongs in is simply whether anything
 * reachable without a dynamic import references it.
 */

export const IconBell = ({ size, class: c }: IconProps) =>
  svg(<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></>, size, c)

export const IconSnow = ({ size, class: c }: IconProps) =>
  svg(<><path d="M12 2v20" /><path d="M2 12h20" /><path d="M5 5l14 14" /><path d="M19 5L5 19" /></>, size, c)

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
/**
 * Google Maps pin, drawn in Google's marker colours — the destination of the
 * "Open in Maps" link. Fixed colours (not currentColor) so it stays recognisable
 * on any background.
 */

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

export const IconTrash = ({ size, class: c }: IconProps) =>
  svg(<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></>, size, c)

export const IconExpand = ({ size, class: c }: IconProps) =>
  svg(<><path d="M4 9V4h5" /><path d="M20 15v5h-5" /><path d="M15 4h5v5" /><path d="M9 20H4v-5" /></>, size, c)

export const IconClose = ({ size, class: c }: IconProps) =>
  svg(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, size, c)

export const IconMinus = ({ size, class: c }: IconProps) => svg(<path d="M5 12h14" />, size, c)

export const IconPlus = ({ size, class: c }: IconProps) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, size, c)

export const IconArrow = ({ size, class: c }: IconProps) => svg(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>, size, c)
