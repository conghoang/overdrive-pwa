import { t } from './i18n'

/**
 * A translated string with **bold** spans: the part a reader must not miss
 * (a cost, a privacy note, what stops working). Plain text otherwise; only for
 * strings rendered as JSX, never in a toast, title or aria label.
 */
export function rt(key: string, vars?: Record<string, string | number>) {
  return t(key, vars)
    .split('**')
    .map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}
