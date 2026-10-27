import type { ComponentChildren } from 'preact'
import { t } from '../lib/i18n'
import { dataSource } from '../lib/store'

/** True while SL6VN Cloud is answering in place of the tunnel. */
export const onCloud = (): boolean => dataSource.value === 'cloud'

/**
 * Grey out something SL6VN Cloud cannot serve, and say why.
 *
 * `inert` rather than a disabled flag threaded through every child: it takes
 * the whole block out of taps and focus at once, and it lifts the moment the
 * tunnel answers again. Off cloud this renders its children untouched.
 */
export function CloudOff({ children }: { children: ComponentChildren }) {
  if (!onCloud()) return <>{children}</>
  return (
    <div class="cloud-off">
      <div inert>{children}</div>
      <p class="cloud-off-hint">{t('cloud.needs_tunnel')}</p>
    </div>
  )
}
