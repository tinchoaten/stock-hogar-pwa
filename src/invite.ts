export interface Invite {
  scriptUrl: string
  geminiKey?: string
  homes: string[]
}

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64Url = (code: string) => {
  let b = code.trim().replace(/-/g, '+').replace(/_/g, '/')
  while (b.length % 4) b += '='
  const bin = atob(b)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export const encodeInvite = (i: Invite) => toB64Url(JSON.stringify(i))

/**
 * Solo URLs de despliegue de Apps Script (…/macros/s/<id>/exec, o la variante de Workspace
 * …/a/macros/<dominio>/s/<id>/exec). Evita que un link ajeno apunte la app a otro servidor.
 */
export function isAppsScriptUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (
      u.protocol === 'https:' &&
      u.hostname === 'script.google.com' &&
      !u.username &&
      !u.password &&
      /^\/(a\/macros\/[^/]+\/|macros\/)s\/[\w-]+\/exec$/.test(u.pathname)
    )
  } catch {
    return false
  }
}

export function decodeInvite(code: string): Invite | null {
  try {
    const o = JSON.parse(fromB64Url(code)) as Partial<Invite>
    if (typeof o.scriptUrl !== 'string' || !isAppsScriptUrl(o.scriptUrl)) return null
    const homes = Array.isArray(o.homes) ? o.homes.map(String).filter(Boolean) : []
    return {
      scriptUrl: o.scriptUrl,
      geminiKey: typeof o.geminiKey === 'string' ? o.geminiKey : undefined,
      homes,
    }
  } catch {
    return null
  }
}

export const inviteLink = (i: Invite) =>
  `${location.origin}${location.pathname}#invite=${encodeInvite(i)}`

/** Acepta un link completo o solo el código. */
export function parseInviteInput(raw: string): Invite | null {
  const m = raw.match(/invite=([A-Za-z0-9_\-+/=]+)/)
  return decodeInvite(m ? m[1] : raw)
}

/**
 * Un link de invitación reemplaza el backend de la app: se pide confirmación mostrando el final
 * del ID del script, para que no se aplique sin que la persona lo sepa. Devuelve null si cancela.
 */
export function confirmInvite(inv: Invite | null): Invite | null {
  if (!inv) return null
  const id = inv.scriptUrl.match(/\/s\/([\w-]+)\/exec/)?.[1] ?? ''
  const ok = window.confirm(
    `Este link quiere conectar la app a una planilla familiar (script …${id.slice(-6)}) y reemplazar tu configuración.\n\nAceptá solo si te lo pasó alguien de confianza.`,
  )
  return ok ? inv : null
}

/** Lee #invite=… del hash y lo limpia de la URL. Llamar una sola vez al cargar el módulo. */
export function takeInviteFromHash(): Invite | null {
  try {
    const m = window.location.hash.match(/invite=([A-Za-z0-9_\-+/=]+)/)
    if (!m) return null
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return decodeInvite(m[1])
  } catch {
    return null
  }
}
