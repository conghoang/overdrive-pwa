import { toasts } from '../lib/toast'
import './Toaster.css'

export function Toaster() {
  return (
    <div class="toaster">
      {toasts.value.map((t) => (
        <div key={t.id} class={'toast ' + t.kind}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
