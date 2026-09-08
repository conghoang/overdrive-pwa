import { getBaseUrl } from '../lib/api'

const OD_LOGO = `${import.meta.env.BASE_URL}icons/icon.svg`

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
        {isReal && (
          <a
            class="od-btn"
            href={base}
            target="_blank"
            rel="noopener noreferrer"
            title="Open OverDrive web"
            aria-label="Open OverDrive web"
          >
            <img src={OD_LOGO} alt="OD" width="22" height="22" />
          </a>
        )}
        <span class={'dot ' + dot} />
      </div>
    </div>
  )
}
