import { useState } from 'react'
import { Package, Receipt, ScanLine, Settings as Cog, ShoppingCart, RefreshCw } from 'lucide-react'
import { useApp } from './store'
import ScannerView from './views/ScannerView'
import ReceiptScannerView from './views/ReceiptScannerView'
import InventoryView from './views/InventoryView'
import ShoppingListView from './views/ShoppingListView'
import SettingsView from './views/SettingsView'
import { HOME_COLORS } from './config'

type Tab = 'scan' | 'ticket' | 'stock' | 'compras' | 'ajustes'

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'scan', label: 'Escáner', icon: ScanLine },
  { id: 'ticket', label: 'Ticket', icon: Receipt },
  { id: 'stock', label: 'Stock', icon: Package },
  { id: 'compras', label: 'Compras', icon: ShoppingCart },
  { id: 'ajustes', label: 'Ajustes', icon: Cog },
]

export default function App() {
  const { settings, activeHome, setActiveHome, accent, syncing, sync, pending, error } = useApp()
  const [tab, setTab] = useState<Tab>('scan')

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

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'scan' && <ScannerView />}
        {tab === 'ticket' && <ReceiptScannerView />}
        {tab === 'stock' && <InventoryView />}
        {tab === 'compras' && <ShoppingListView />}
        {tab === 'ajustes' && <SettingsView />}
      </main>

      <nav className="grid shrink-0 grid-cols-5 border-t border-slate-800 bg-slate-900 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
            style={{ color: tab === id ? accent : '#94a3b8' }}
          >
            <Icon size={24} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
