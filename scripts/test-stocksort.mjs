// Verificación liviana del orden de Stock. Uso: node --experimental-strip-types scripts/test-stocksort.mjs
import assert from 'node:assert/strict'
import { sortItems } from '../src/stockSort.ts'

const it = (id, nombre, venc, ing, precio = 0) => ({ id_item: id, nombre, fecha_vencimiento: venc, fecha_ingreso: ing, precio_pagado: precio })
const names = (l) => l.map((x) => x.nombre)

const base = [
  it('it_aaaaaaaa1', 'Zanahoria', '2026-12-01', '2026-11-10'),
  it('it_aaaaaaaa2', 'árbol de té', '', '2026-11-14T03:00:00.000Z'),
  it('it_aaaaaaaa3', 'Leche 10', '2026-11-25', '2026-11-14'),
  it('it_aaaaaaaa4', 'leche 2', '2026-11-25T03:00:00.000Z', '2026-11-12'),
  it('it_aaaaaaaa5', 'Ñoquis', '2026-11-20', '2026-11-14'),
  it('it_aaaaaaaa6', '', '2026-11-30', ''),
  it('it_aaaaaaaa7', 'arroz', '', '2026-11-01', 500),
]

// Vencimiento: primero el que vence antes, sin vencimiento al final
assert.deepEqual(names(sortItems(base, 'venc')), ['Ñoquis', 'leche 2', 'Leche 10', '', 'Zanahoria', 'árbol de té', 'arroz'])
// A-Z: ignora acentos y mayúsculas, números naturales, vacíos al final
assert.deepEqual(names(sortItems(base, 'az')), ['árbol de té', 'arroz', 'leche 2', 'Leche 10', 'Ñoquis', 'Zanahoria', ''])
// Z-A
assert.deepEqual(names(sortItems(base, 'za')), ['Zanahoria', 'Ñoquis', 'Leche 10', 'leche 2', 'arroz', 'árbol de té', ''])
// Más recientes: 14-nov (ISO con hora y simple) primero; mismo día desempata por id y luego por posición
const nuevos = sortItems(base, 'nuevos')
assert.deepEqual(names(nuevos).slice(0, 3), ['Ñoquis', 'Leche 10', 'árbol de té'])
assert.equal(names(nuevos).at(-1), '') // sin fecha, al final
// Más antiguos
assert.deepEqual(names(sortItems(base, 'viejos')).slice(0, 2), ['arroz', 'Zanahoria'])
// Precio
assert.equal(sortItems(base, 'precio')[0].nombre, 'arroz')
// Tanda en el mismo instante (id con mismo prefijo de tiempo): más abajo = más reciente
const tanda = [it('it_lq1abcd1x', 'A', '', '2026-11-14'), it('it_lq1abcd1y', 'B', '', '2026-11-14'), it('it_lq1abcd1z', 'C', '', '2026-11-14')]
assert.deepEqual(names(sortItems(tanda, 'nuevos')), ['C', 'B', 'A'])
assert.deepEqual(names(sortItems(tanda, 'viejos')), ['A', 'B', 'C'])
// Hora de id distinta el mismo día
const dia = [it('it_lq1abcd2a', 'tarde', '', '2026-11-14'), it('it_lq1abcd1a', 'mañana', '', '2026-11-14')]
assert.deepEqual(names(sortItems(dia, 'nuevos')), ['tarde', 'mañana'])
// Bordes: vacía, un ítem, no muta
assert.deepEqual(sortItems([], 'az'), [])
assert.equal(sortItems([base[0]], 'nuevos').length, 1)
const copia = base.map((x) => x.nombre)
sortItems(base, 'az')
assert.deepEqual(names(base), copia)
console.log('stockSort: todo OK')
