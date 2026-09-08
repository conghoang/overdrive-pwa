export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      class={'switch' + (on ? ' on' : '')}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span class="switch-knob" />
    </button>
  )
}
