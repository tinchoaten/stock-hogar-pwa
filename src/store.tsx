import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { fetchAll, postPayload } from './api'
import { DEFAULT_SETTINGS, EMPTY_DB, HOME_COLORS, STORAGE_KEYS } from './config'
import type {
  CatalogItem,
  DB,
  HomeRule,
  InventoryItem,
  Payload,
  ReceiptAlias,
  Settings,
  ShoppingItem,
} from './types'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* cuota llena o modo privado */
  }
}

export type ItemPatch = Partial<
  Pick<
    InventoryItem,
    'estado' | 'ubicacion' | 'fecha_vencimiento' | 'fecha_apertura' | 'fecha_baja'
  >
>

export interface Toast {
  id: number
  msg: string
  undo?: () => void
}

interface Ctx {
  toast: Toast | null
  showToast: (msg: string, undo?: () => void) => void
  dismissToast: () => void
  db: DB
  settings: Settings
  setSettings: (s: Settings) => void
  replaceDB: (db: DB) => void
  activeHome: string
  accent: string
  setActiveHome: (h: string) => void
  syncing: boolean
  pending: number
  error: string
  lastSync: string
  sync: () => Promise<void>
  stockOf: (home: string, ean: string) => InventoryItem[]
  upsertCatalog: (item: CatalogItem) => void
  upsertRule: (rule: HomeRule) => void
  addInventory: (items: InventoryItem[]) => void
  updateStatus: (id_item: string, patch: ItemPatch) => void
  transferItem: (id_item: string, nuevo_hogar_id: string) => void
  linkAlias: (alias: ReceiptAlias) => void
  toggleShopping: (item: ShoppingItem) => void
}

const AppCtx = createContext<Ctx | null>(null)

/** Activo = no consumido. 'Baja' es el valor viejo de 'Consumido'. */
export const isActiveItem = (i: InventoryItem) =>
  !i.fecha_baja && i.estado !== 'Consumido' && i.estado !== 'Baja'

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(() => {
    const s = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(STORAGE_KEYS.settings, {}) }
    if (!s.homes?.length) s.homes = DEFAULT_SETTINGS.homes
    if (!s.homes.includes(s.activeHome)) s.activeHome = s.homes[0]
    return s
  })
  const [db, setDb] = useState<DB>(() => ({ ...EMPTY_DB, ...load<Partial<DB>>(STORAGE_KEYS.db, {}) }))
  const [queue, setQueue] = useState<Payload[]>(() => load<Payload[]>(STORAGE_KEYS.queue, []))
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(() => load<string>(STORAGE_KEYS.lastSync, ''))

  const queueRef = useRef(queue)
  const settingsRef = useRef(settings)
  const flushing = useRef(false)
  settingsRef.current = settings
  queueRef.current = queue

  useEffect(() => save(STORAGE_KEYS.settings, settings), [settings])
  useEffect(() => save(STORAGE_KEYS.db, db), [db])
  useEffect(() => save(STORAGE_KEYS.queue, queue), [queue])

  const flush = useCallback(async () => {
    if (flushing.current) return
    if (!settingsRef.current.scriptUrl) {
      setError('Falta configurar la APPS_SCRIPT_URL en Ajustes.')
      return
    }
    flushing.current = true
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0]
        await postPayload(settingsRef.current.scriptUrl, next)
        queueRef.current = queueRef.current.slice(1)
        setQueue(queueRef.current)
      }
      setError('')
    } catch (e) {
      setError(`Sin conexión con el servidor: ${(e as Error).message}`)
    } finally {
      flushing.current = false
    }
  }, [])

  const sync = useCallback(async () => {
    if (!settingsRef.current.scriptUrl) {
      setError('Falta configurar la APPS_SCRIPT_URL en Ajustes.')
      return
    }
    setSyncing(true)
    try {
      await flush()
      if (queueRef.current.length === 0) {
        const data = await fetchAll(settingsRef.current.scriptUrl)
        setDb(data)
        const now = new Date().toISOString()
        setLastSync(now)
        save(STORAGE_KEYS.lastSync, now)
        setError('')
      }
    } catch (e) {
      setError(`No se pudo sincronizar: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }, [flush])

  // Sincroniza al abrir y cuando vuelve la conexión / la app al frente.
  useEffect(() => {
    void sync()
    const onOnline = () => void sync()
    const onVisible = () => document.visibilityState === 'visible' && void flush()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sync, flush])

  /** Optimistic UI: aplica el cambio local ya, y encola el POST. */
  const commit = useCallback(
    (payload: Payload, apply: (db: DB) => DB) => {
      setDb(apply)
      const q = [...queueRef.current, payload]
      queueRef.current = q
      setQueue(q)
      void flush()
    },
    [flush],
  )

  const setSettings = useCallback((s: Settings) => {
    const next = { ...s }
    if (!next.homes.length) next.homes = DEFAULT_SETTINGS.homes
    if (!next.homes.includes(next.activeHome)) next.activeHome = next.homes[0]
    setSettingsState(next)
  }, [])

  const setActiveHome = useCallback(
    (h: string) => setSettingsState((s) => ({ ...s, activeHome: h })),
    [],
  )

  const upsertCatalog = useCallback(
    (item: CatalogItem) =>
      commit({ action: 'UPSERT_CATALOG', item }, (d) => ({
        ...d,
        catalogo: [...d.catalogo.filter((c) => String(c.ean) !== item.ean), item],
      })),
    [commit],
  )

  const upsertRule = useCallback(
    (item: HomeRule) =>
      commit({ action: 'UPSERT_HOME_RULE', item }, (d) => ({
        ...d,
        reglasHogar: [
          ...d.reglasHogar.filter(
            (r) => !(r.hogar_id === item.hogar_id && String(r.ean) === item.ean),
          ),
          item,
        ],
      })),
    [commit],
  )

  const addInventory = useCallback(
    (items: InventoryItem[]) =>
      commit({ action: 'ADD_INVENTORY', items }, (d) => ({
        ...d,
        inventario: [...d.inventario, ...items],
      })),
    [commit],
  )

  const updateStatus = useCallback(
    (id_item: string, patch: ItemPatch) =>
      commit({ action: 'UPDATE_ITEM_STATUS', id_item, ...patch }, (d) => ({
        ...d,
        inventario: d.inventario.map((i) => (i.id_item === id_item ? { ...i, ...patch } : i)),
      })),
    [commit],
  )

  const transferItem = useCallback(
    (id_item: string, nuevo_hogar_id: string) =>
      commit({ action: 'TRANSFER_ITEM', id_item, nuevo_hogar_id }, (d) => ({
        ...d,
        inventario: d.inventario.map((i) =>
          i.id_item === id_item ? { ...i, hogar_id: nuevo_hogar_id } : i,
        ),
      })),
    [commit],
  )

  const linkAlias = useCallback(
    (item: ReceiptAlias) =>
      commit({ action: 'LINK_RECEIPT_ALIAS', item }, (d) => ({
        ...d,
        diccionario: [
          ...d.diccionario.filter(
            (a) => !(a.alias_ticket === item.alias_ticket && a.comercio === item.comercio),
          ),
          item,
        ],
      })),
    [commit],
  )

  const toggleShopping = useCallback(
    (item: ShoppingItem) =>
      commit({ action: 'TOGGLE_SHOPPING_LIST', item }, (d) => ({
        ...d,
        listaCompras: [
          ...d.listaCompras.filter(
            (l) => !(l.hogar_id === item.hogar_id && String(l.ean) === item.ean),
          ),
          item,
        ],
      })),
    [commit],
  )

  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  const showToast = useCallback((msg: string, undo?: () => void) => {
    clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), msg, undo })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const replaceDB = useCallback((next: DB) => setDb({ ...EMPTY_DB, ...next }), [])

  const stockOf = useCallback(
    (home: string, ean: string) =>
      db.inventario
        .filter((i) => i.hogar_id === home && String(i.ean) === String(ean) && isActiveItem(i))
        .sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999')),
    [db.inventario],
  )

  const activeHome = settings.activeHome
  const accent = HOME_COLORS[Math.max(0, settings.homes.indexOf(activeHome)) % HOME_COLORS.length]

  const value = useMemo<Ctx>(
    () => ({
      toast,
      showToast,
      dismissToast,
      db,
      settings,
      setSettings,
      replaceDB,
      activeHome,
      accent,
      setActiveHome,
      syncing,
      pending: queue.length,
      error,
      lastSync,
      sync,
      stockOf,
      upsertCatalog,
      upsertRule,
      addInventory,
      updateStatus,
      transferItem,
      linkAlias,
      toggleShopping,
    }),
    [
      toast,
      showToast,
      dismissToast,
      db,
      settings,
      setSettings,
      replaceDB,
      activeHome,
      accent,
      setActiveHome,
      syncing,
      queue.length,
      error,
      lastSync,
      sync,
      stockOf,
      upsertCatalog,
      upsertRule,
      addInventory,
      updateStatus,
      transferItem,
      linkAlias,
      toggleShopping,
    ],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp fuera de AppProvider')
  return c
}
