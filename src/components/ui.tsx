import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[44px] flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition active:scale-95 ${
        active ? 'text-white' : 'bg-slate-800 text-slate-300'
      }`}
      style={active ? { background: color ?? '#059669' } : undefined}
    >
      {children}
    </button>
  )
}

export function BigButton({
  onClick,
  children,
  color,
  disabled,
  className = '',
}: {
  onClick: () => void
  children: ReactNode
  color?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[52px] w-full rounded-2xl px-4 text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-40 ${className}`}
      style={{ background: color ?? '#059669' }}
    >
      {children}
    </button>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-slate-900 p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-slate-800 p-2" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}
