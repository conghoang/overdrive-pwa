import { getBaseUrl } from '../lib/api'
import { t } from '../lib/i18n'
import { setTheme, theme } from '../lib/theme'
import { IconMoon, IconSun, IconThemeAuto } from './icons'

/** System -> Light -> Dark -> System. One button, and the glyph states which. */
const THEME_CYCLE = {
  system: { next: 'light', Icon: IconThemeAuto, label: 'dev.theme_system' },
  light: { next: 'dark', Icon: IconSun, label: 'dev.theme_light' },
  dark: { next: 'system', Icon: IconMoon, label: 'dev.theme_dark' },
} as const

const OD_LOGO = `${import.meta.env.BASE_URL}icons/od.webp`

/** Screen header with title, status dot, and a logo button that opens the
 *  car's original OverDrive web UI (the base URL) in a new tab. */
export function AppHeader({
  title,
  sub,
  dot,
}: {
  title: string
  sub: string
  dot: 'ok' | 'wait' | 'bad'
}) {
  const base = getBaseUrl()
  const isReal = /^https?:\/\//i.test(base)
  return (
    <div class="screen-head">
      <div>
        <h1 class="screen-title">{title}</h1>
        <div class="screen-sub">{sub}</div>
      </div>
      <div class="head-actions">
        <ThemeButton />
        {isReal && (
          <a
            class="od-btn"
            href={base}
            target="_blank"
            rel="noopener noreferrer"
            title={t('header.open_web')}
            aria-label={t('header.open_web')}
          >
            <img src={OD_LOGO} alt="OD" width="24" height="24" />
          </a>
        )}
        <span class={'dot ' + dot} />
      </div>
    </div>
  )
}

function ThemeButton() {
  const cur = THEME_CYCLE[theme.value]
  const Icon = cur.Icon
  return (
    <button
      class="head-btn"
      title={`${t('dev.theme')}: ${t(cur.label)}`}
      aria-label={`${t('dev.theme')}: ${t(cur.label)}`}
      onClick={() => setTheme(cur.next)}
    >
      <Icon size={21} />
    </button>
  )
}
