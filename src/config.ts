import type { Comercio, DB, Settings, Ubicacion } from './types'

export const DEFAULT_HOMES = ['Casa Principal', 'Casa 2']

export const DEFAULT_SETTINGS: Settings = {
  alias: '',
  geminiKey: '',
  scriptUrl: '', // se configura en Ajustes y vive solo en localStorage
  homes: DEFAULT_HOMES,
  activeHome: DEFAULT_HOMES[0],
}

export const EMPTY_DB: DB = {
  catalogo: [],
  reglasHogar: [],
  inventario: [],
  diccionario: [],
  listaCompras: [],
}

export const COMERCIOS: Comercio[] = ['Supermercado', 'Kiosco/Despensa', 'Verdulería']
export const UBICACIONES: Ubicacion[] = ['Alacena', 'Heladera', 'Freezer']

/** Color de acento por posición del hogar en la lista. */
export const HOME_COLORS = ['#059669', '#4f46e5', '#d97706', '#e11d48', '#0284c7']

export const STORAGE_KEYS = {
  settings: 'sh.settings',
  db: 'sh.db',
  queue: 'sh.queue',
  lastSync: 'sh.lastSync',
}

// Se prueban en orden; si Google retira uno, se usa el siguiente.
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash']
