import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { BigButton, Label } from '../components/ui'
import { useApp } from '../store'
import type { DB } from '../types'

export default function SettingsView() {
  const { settings, setSettings, db, replaceDB, accent, sync, syncing, pending, error, lastSync } = useApp()
  const [key, setKey] = useState(settings.geminiKey)
  const [url, setUrl] = useState(settings.scriptUrl)
  const [homes, setHomes] = useState(settings.homes)
  const [saved, setSaved] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const guardar = () => {
    const clean = homes.map((h) => h.trim()).filter(Boolean)
    setSettings({
      ...settings,
      geminiKey: key.trim(),
      scriptUrl: url.trim(),
      homes: clean.length ? clean : settings.homes,
    })
    setSaved('Guardado ✓')
    setTimeout(() => setSaved(''), 2000)
    setTimeout(() => void sync(), 100)
  }

  const exportar = () => {
    const blob = new Blob([JSON.stringify({ settings, db }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stock-hogar-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importar = async (file: File) => {
    try {
      const j = JSON.parse(await file.text()) as { settings?: typeof settings; db?: DB }
      if (j.db) replaceDB(j.db)
      if (j.settings) setSettings({ ...settings, ...j.settings })
      setSaved('Backup restaurado ✓ (solo local; sincronizá para ver el servidor)')
    } catch {
      setSaved('El archivo no es un backup válido')
    }
  }

  const input = 'w-full rounded-xl bg-slate-800 px-3 py-3 text-base'

  return (
    <div className="space-y-1 p-3">
      <Label>GEMINI_API_KEY</Label>
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" className={input} autoCapitalize="off" />
      <p className="text-xs text-slate-500">Se guarda solo en este dispositivo (localStorage).</p>

      <Label>APPS_SCRIPT_URL</Label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" className={input} autoCapitalize="off" />

      <Label>Hogares</Label>
      <div className="space-y-2">
        {homes.map((h, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={h}
              onChange={(e) => setHomes(homes.map((x, j) => (j === i ? e.target.value : x)))}
              className={input}
            />
            <button
              onClick={() => setHomes(homes.filter((_, j) => j !== i))}
              disabled={homes.length <= 1}
              className="rounded-xl bg-slate-800 px-3 disabled:opacity-30"
              aria-label="Quitar hogar"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <button
          onClick={() => setHomes([...homes, `Casa ${homes.length + 1}`])}
          className="flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold"
        >
          <Plus size={16} /> Agregar hogar
        </button>
        <p className="text-xs text-slate-500">
          Renombrar un hogar no actualiza los registros ya guardados con el nombre anterior.
        </p>
      </div>

      <div className="pt-3">
        <BigButton color={accent} onClick={guardar}>
          Guardar ajustes
        </BigButton>
        {saved && <p className="mt-2 text-center text-sm text-emerald-400">{saved}</p>}
      </div>

      <Label>Sincronización</Label>
      <div className="rounded-2xl bg-slate-800 p-3 text-sm">
        <p>Última sync: {lastSync ? new Date(lastSync).toLocaleString('es-AR') : 'nunca'}</p>
        <p>Cambios pendientes de enviar: {pending}</p>
        {error && <p className="mt-1 text-red-400">{error}</p>}
        <button
          onClick={() => void sync()}
          disabled={syncing}
          className="mt-2 min-h-[44px] w-full rounded-xl bg-slate-700 font-semibold disabled:opacity-50"
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      <Label>Backup</Label>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={exportar} className="min-h-[48px] rounded-xl bg-slate-700 font-semibold">
          Exportar JSON
        </button>
        <button onClick={() => fileRef.current?.click()} className="min-h-[48px] rounded-xl bg-slate-700 font-semibold">
          Importar JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importar(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
