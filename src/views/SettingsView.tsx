import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Copy, Plus, Share2, Trash2 } from 'lucide-react'
import { BigButton, Label } from '../components/ui'
import { generate, textOf } from '../gemini'
import { inviteLink, parseInviteInput } from '../invite'
import { useApp } from '../store'
import type { DB } from '../types'

const QR = lazy(() => import('../components/QR'))

export default function SettingsView() {
  const { settings, setSettings, db, replaceDB, accent, sync, syncing, pending, error, lastSync, showToast } =
    useApp()
  const [alias, setAlias] = useState(settings.alias)
  const [key, setKey] = useState(settings.geminiKey)
  const [url, setUrl] = useState(settings.scriptUrl)
  const [homes, setHomes] = useState(settings.homes)
  const [saved, setSaved] = useState('')
  const [invite, setInvite] = useState('')
  const [withKey, setWithKey] = useState(true)
  const [pasted, setPasted] = useState('')
  const [iaTest, setIaTest] = useState<{ ok: boolean; msg: string } | null>(null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaStep, setIaStep] = useState('')

  const probarIA = async () => {
    const k = (draft.current.key || settings.geminiKey).trim()
    if (!k) {
      setIaTest({ ok: false, msg: 'No hay clave cargada.' })
      return
    }
    setIaBusy(true)
    setIaTest(null)
    try {
      const j = await generate(
        k,
        { contents: [{ parts: [{ text: 'Respondé solo con la palabra OK' }] }] },
        { timeoutMs: 20000, onTry: (m) => setIaStep(m) },
      )
      const txt = textOf(j)
      setIaTest({ ok: true, msg: `Gemini (${j._model}) respondió: “${txt || '(sin texto)'}”. La clave funciona.` })
    } catch (e) {
      setIaTest({ ok: false, msg: `Falló: ${(e as Error).message}` })
    } finally {
      setIaBusy(false)
    }
  }
  const fileRef = useRef<HTMLInputElement>(null)

  // Autoguardado: alias, clave de Gemini y URL se guardan al salir del campo y al salir de la pantalla,
  // para que no se pierdan si no se toca "Guardar ajustes".
  const draft = useRef({ alias, key, url })
  draft.current = { alias, key, url }
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const commit = () => {
    const d = draft.current
    const s = settingsRef.current
    const next = { alias: d.alias.trim(), geminiKey: d.key.trim(), scriptUrl: d.url.trim() }
    if (next.alias !== s.alias || next.geminiKey !== s.geminiKey || next.scriptUrl !== s.scriptUrl) {
      setSettings({ ...s, ...next })
    }
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => () => commitRef.current(), [])

  const guardar = () => {
    const clean = homes.map((h) => h.trim()).filter(Boolean)
    setSettings({
      ...settings,
      alias: alias.trim(),
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

  // --- Invitación familiar ---
  const generarInvitacion = () => {
    if (!settings.scriptUrl) {
      setSaved('Guardá primero la APPS_SCRIPT_URL.')
      return
    }
    setInvite(
      inviteLink({
        scriptUrl: settings.scriptUrl,
        geminiKey: withKey && settings.geminiKey ? settings.geminiKey : undefined,
        homes: settings.homes,
      }),
    )
  }

  const textoInvitacion = () =>
    `${settings.alias ? `${settings.alias} te invita` : 'Te invito'} a Stock Hogar. Abrí este link en Safari y quedás conectado:\n${invite}`

  const compartir = async () => {
    const text = textoInvitacion()
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Stock Hogar', text })
        return
      } catch {
        /* canceló: no hacemos nada */
        return
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(invite)
      showToast('Link copiado ✓')
    } catch {
      showToast('No se pudo copiar; mantené apretado el link')
    }
  }

  const aplicarPegado = () => {
    const inv = parseInviteInput(pasted)
    if (!inv) {
      setSaved('Ese link o código de invitación no es válido')
      return
    }
    setSettings({
      ...settings,
      scriptUrl: inv.scriptUrl,
      geminiKey: inv.geminiKey ?? settings.geminiKey,
      homes: inv.homes.length ? inv.homes : settings.homes,
    })
    setUrl(inv.scriptUrl)
    if (inv.geminiKey) setKey(inv.geminiKey)
    if (inv.homes.length) setHomes(inv.homes)
    setPasted('')
    setSaved('Invitación aplicada ✓')
    setTimeout(() => void sync(), 100)
  }

  const input = 'w-full rounded-xl bg-slate-800 px-3 py-3 text-base'

  return (
    <div className="space-y-1 p-3">
      <Label>Mi nombre / alias</Label>
      <input value={alias} onChange={(e) => setAlias(e.target.value)} onBlur={commit} placeholder="Ej: Juan" className={input} autoComplete="off" />

      <Label>GEMINI_API_KEY</Label>
      {/* type=text + text-security: evita que iOS lo trate como contraseña y lo autocomplete o borre */}
      <input
        type="text"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onBlur={commit}
        placeholder="AIza…"
        className={input}
        style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        name="gemini-key"
      />
      <p className="text-xs" style={{ color: settings.geminiKey ? '#4ade80' : '#fbbf24' }}>
        {settings.geminiKey
          ? `✓ Clave guardada en este dispositivo (${settings.geminiKey.slice(0, 4)}…${settings.geminiKey.slice(-4)})`
          : '⚠ Todavía no hay clave guardada en este dispositivo'}
      </p>
      <button
        onClick={() => void probarIA()}
        disabled={iaBusy}
        className="mt-2 min-h-[44px] w-full rounded-xl bg-slate-700 font-semibold disabled:opacity-50"
      >
        {iaBusy ? `Probando${iaStep ? ` (${iaStep})` : ''}…` : 'Probar conexión con Gemini'}
      </button>
      {iaTest && (
        <p className="mt-1 text-sm" style={{ color: iaTest.ok ? '#4ade80' : '#f87171' }}>
          {iaTest.ok ? '✓ ' : '✗ '}
          {iaTest.msg}
        </p>
      )}

      <Label>APPS_SCRIPT_URL</Label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={commit} placeholder="https://script.google.com/macros/s/…/exec" className={input} autoCapitalize="off" />

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

      <Label>Modo familiar</Label>
      <div className="space-y-3 rounded-2xl bg-slate-800 p-3">
        <button
          onClick={generarInvitacion}
          className="min-h-[52px] w-full rounded-xl font-bold text-white"
          style={{ background: accent }}
        >
          Invitar Familiar (Link / QR)
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} className="h-5 w-5" />
          Incluir la GEMINI_API_KEY en la invitación
        </label>
        {invite && (
          <>
            <Suspense fallback={<p className="text-center text-sm text-slate-400">Generando QR…</p>}>
              <QR text={invite} />
            </Suspense>
            <p className="rounded-lg bg-amber-950 p-2 text-xs text-amber-200">
              Este link contiene tu URL del Apps Script{withKey && settings.geminiKey ? ' y tu clave de Gemini' : ''}.
              Compartilo solo con gente de confianza.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => void compartir()} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white">
                <Share2 size={18} /> WhatsApp
              </button>
              <button onClick={() => void copiar()} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-slate-700 font-bold">
                <Copy size={18} /> Copiar link
              </button>
            </div>
          </>
        )}

        <div className="border-t border-slate-700 pt-3">
          <p className="mb-1 text-xs text-slate-400">
            ¿Te invitaron? Pegá acá el link o el código (útil si instalaste la app en la pantalla de inicio):
          </p>
          <div className="flex gap-2">
            <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Link de invitación" className={input} autoCapitalize="off" />
            <button onClick={aplicarPegado} disabled={!pasted.trim()} className="rounded-xl bg-slate-700 px-4 font-bold disabled:opacity-40">
              Usar
            </button>
          </div>
        </div>
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
