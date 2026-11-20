export interface CatalogItem {
  ean: string
  nombre: string
  marca: string
  categoria: string
  dias_vida_util_cerrado: number
  dias_vida_util_abierto: number
  ultimo_precio: number
  sin_tacc: boolean
}

export interface HomeRule {
  hogar_id: string
  ean: string
  stock_minimo: number
  ubicacion_habitual: string
}

export interface InventoryItem {
  id_item: string
  hogar_id: string
  ean: string
  nombre: string
  fecha_ingreso: string
  fecha_vencimiento: string
  ubicacion: string
  estado: string
  fecha_apertura: string
  fecha_baja: string
  precio_pagado: number
  comercio: string
}

export interface ReceiptAlias {
  alias_ticket: string
  comercio: string
  ean_asociado: string
}

export interface ShoppingItem {
  hogar_id: string
  ean: string
  nombre: string
  cantidad_sugerida: number
  ultimo_precio: number
  comercio_mas_barato: string
  comprado: boolean
}

export interface DB {
  catalogo: CatalogItem[]
  reglasHogar: HomeRule[]
  inventario: InventoryItem[]
  diccionario: ReceiptAlias[]
  listaCompras: ShoppingItem[]
}

export interface Settings {
  alias: string
  geminiKey: string
  scriptUrl: string
  homes: string[]
  activeHome: string
  /** Modelo de Gemini preferido (vacío = automático). */
  geminiModel: string
}

export type Ubicacion = 'Alacena' | 'Heladera' | 'Freezer'
export type Comercio = 'Supermercado' | 'Kiosco/Despensa' | 'Verdulería'

export type Payload = { action: string; [k: string]: unknown }
