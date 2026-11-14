import { lazy, Suspense, useState } from 'react'
import { BarChart3, Package, Receipt, ScanLine, Settings as Cog, ShoppingCart, RefreshCw } from 'lucide-react'
import { isActiveItem, useApp } from './store'
import { daysUntil } from './utils'
import InventoryView from './views/InventoryView'
import ShoppingListView from './views/ShoppingListView'
import SettingsView from './views/SettingsView'
import { HOME_COLORS } from './config'

// Vistas pesadas: se descargan recién cuando se abren.
const ScannerView = lazy(() => import('./views/ScannerView'))
const ReceiptScannerView = lazy(() => import('./views/ReceiptScannerView'))
const StatsView = lazy(() => import('./views/StatsView'))

type Tab = 'scan' | 'ticket' | 'stock' | 'compras' | 'stats' | 'ajustes'

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'scan', label: 'Escáner', icon: ScanLine },
  { id: 'ticket', label: 'Ticket', icon: Receipt },
  { id: 'stock', label: 'Stock', icon: Package },
  { id: 'compras', label: 'Compras', icon: ShoppingCart },
  { id: 'stats', label: 'Gastos', icon: BarChart3 },
  { id: 'ajustes', label: 'Ajustes', icon: Cog },
]

const Cargando = () => <p className="p-10 text-center text-slate-400">Cargando…</p>

export default function App() {
  const { settings, activeHome, setActiveHome, accent, syncing, sync, pending, error, rejected, dismissRejected, db, toast, dismissToast } =
    useApp()
  const [tab, setTab] = useState<Tab>('scan')
  const [bannerOff, setBannerOff] = useState(false)

  const porVencer = db.inventario.filter((i) => {
    if (i.hogar_id !== activeHome || !isActiveItem(i)) return false
    const d = daysUntil(i.fecha_vencimiento)
    return d !== null && d <= 3
  })
  const vencidos = porVencer.filter((i) => (daysUntil(i.fecha_vencimiento) ?? 0) < 0).length

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      <header
        className="shrink-0 px-3 pb-2 pt-[max(env(safe-area-inset-top),12px)]"
        style={{ borderTop: `6px solid ${accent}`, background: '#0f172a' }}
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {settings.homes.map((h, i) => {
              const active = h === activeHome
              return (
                <button
                  key={h}
                  onClick={() => setActiveHome(h)}
                  className="min-h-[44px] whitespace-nowrap rounded-xl px-4 text-sm font-bold transition active:scale-95"
                  style={
                    active
                      ? { background: HOME_COLORS[i % HOME_COLORS.length], color: '#fff' }
                      : { background: '#1e293b', color: '#94a3b8' }
                  }
                >
                  {h}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => void sync()}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800"
            aria-label="Sincronizar"
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            {(pending > 0 || error) && (
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
            )}
          </button>
        </div>
      </header>

      {rejected && (
        <div className="flex shrink-0 items-start gap-2 bg-amber-950 px-3 py-2 text-sm font-semibold text-amber-200">
          <p className="flex-1">⚠ {rejected}</p>
          <button className="min-h-[44px] min-w-[44px] px-2 text-amber-300" onClick={dismissRejected} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {porVencer.length > 0 && !bannerOff && tab !== 'stock' && (
        <div className="flex shrink-0 items-center gap-2 bg-red-950 px-3 py-2 text-sm">
          <button className="min-h-[40px] flex-1 text-left font-semibold text-red-200" onClick={() => setTab('stock')}>
            ⚠ {porVencer.length} {porVencer.length === 1 ? 'producto vence' : 'productos vencen'} en 3 días o menos
            {vencidos > 0 ? ` (${vencidos} ya vencido${vencidos > 1 ? 's' : ''})` : ''} · Ver
          </button>
          <button className="min-h-[40px] px-2 text-red-300" onClick={() => setBannerOff(true)} aria-label="Ocultar aviso">
            ✕
          </button>
        </div>
      )}

      <main className="relative min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<Cargando />}>
          {tab === 'scan' && <ScannerView />}
          {tab === 'ticket' && <ReceiptScannerView />}
          {tab === 'stock' && <InventoryView />}
          {tab === 'compras' && <ShoppingListView />}
          {tab === 'stats' && <StatsView />}
          {tab === 'ajustes' && <SettingsView />}
        </Suspense>
      </main>

      {toast && (
        <div
          key={toast.id}
          className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-slate-900 shadow-xl"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{toast.msg}</span>
          {toast.undo && (
            <button
              className="min-h-[40px] rounded-lg px-3 text-sm font-extrabold"
              style={{ color: accent }}
              onClick={() => {
                toast.undo?.()
                dismissToast()
              }}
            >
              DESHACER
            </button>
          )}
        </div>
      )}

      <nav className="grid shrink-0 grid-cols-6 border-t border-slate-800 bg-slate-900 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold"
            style={{ color: tab === id ? accent : '#94a3b8' }}
          >
            <Icon size={22} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
