# Stock Hogar PWA

PWA mobile-first (pensada para iPhone/Safari) para controlar el stock de uno o más hogares: escáner de códigos EAN-13, lectura de tickets con IA (Gemini), inventario con semáforo de vencimientos y lista de compras. El backend es un Google Apps Script sobre una planilla.

## Stack
React 18 + TypeScript + Vite 8 + Tailwind CSS 3 + `vite-plugin-pwa` + `html5-qrcode` + `lucide-react`. Despliegue con `gh-pages` en GitHub Pages (`base: '/stock-hogar-pwa/'`).

## Comandos
- `npm run dev` — desarrollo
- `npm run build` — `tsc` + build de producción (`dist/`)
- `npm run deploy` — build y publicación en la rama `gh-pages`
- `npm run icons` — regenera los PNG de `public/` (`scripts/make-icons.mjs`)
- Instalar dependencias con `--legacy-peer-deps` (conflicto de peers de Babel con `vite-plugin-pwa`).

## Backend (Apps Script)
- La URL NO está en el código (repo público): se carga en Ajustes y vive solo en `localStorage` (`settings.scriptUrl`). Sin URL, la app no sincroniza y avisa.
- `GET` → `{ status: "ok", data: { catalogo, reglasHogar, inventario, diccionario, listaCompras } }`.
- `POST` siempre con `Content-Type: text/plain;charset=utf-8` (evita preflight CORS). El cuerpo es JSON con `action` en el primer nivel.
- Acciones: `UPSERT_CATALOG`, `UPSERT_HOME_RULE`, `ADD_INVENTORY`, `UPDATE_ITEM_STATUS`, `TRANSFER_ITEM`, `LINK_RECEIPT_ALIAS`, `TOGGLE_SHOPPING_LIST`. Los campos de cada una están tipados en `src/types.ts`.
- `UPDATE_ITEM_STATUS` y `TRANSFER_ITEM` se envían con los campos planos junto a `action` (sin `item`); las demás usan `item` / `items`.

## Arquitectura
- `src/store.tsx` — estado global (Context). **Optimistic UI**: cada cambio se aplica en local al instante, se guarda en `localStorage` y se encola un POST (`sh.queue`) que se reintenta al volver la conexión. Al abrir sincroniza: primero vacía la cola y recién después hace el GET.
- `src/api.ts` — GET/POST al Apps Script y consulta a Open Food Facts.
- `src/views/` — `ScannerView` (ingreso / salida), `ReceiptScannerView` (ticket + Gemini), `InventoryView`, `ShoppingListView`, `SettingsView`.
- `src/components/BarcodeScanner.tsx` — lector continuo (cámara trasera, beep con `AudioContext`, anti-rebote de 2,5 s, ingreso manual de EAN).
- `src/voice.ts` — dictado con `webkitSpeechRecognition` (es-AR) y parser de cantidad / precio / vencimiento.
- Header multi-hogar: `settings.homes` y `settings.activeHome`; el color de acento (`HOME_COLORS`) cambia según el hogar activo.

## UX transversal
- **Deshacer:** `showToast(msg, undo)` en el store; todas las acciones de `useItemActions` restauran los valores previos (5 s).
- **Aviso de vencimientos:** banner en `App.tsx` con ítems del hogar activo que vencen en ≤ 3 días (incluye vencidos); lleva a Stock.
- **Stock mínimo editable:** sección plegable en `InventoryView` (`UPSERT_HOME_RULE`).
- **Ráfaga:** en Modo Ingreso, suma +1 con los datos habituales (regla, último precio, vida útil) sin formulario; si el producto no tiene nombre, abre el formulario normal. El deshacer de ráfaga marca la unidad como `Consumido`.

## Convenciones y supuestos
- Estados de ítem (los que evalúa `Code.gs`): `Cerrado`, `Abierto`, `Consumido`. Un ítem está activo si no tiene `fecha_baja` y no está `Consumido`. Por compatibilidad, `En Stock` se muestra como `Cerrado` y `Baja` como `Consumido`.
- Fechas como `YYYY-MM-DD` en hora local.
- Vida útil estimada por categoría (`shelfLifeFor` en `src/utils.ts`): lácteos 20d/5d, almacén 180d/60d, entre otras.
- Stock mínimo por defecto al ingresar un producto nuevo en un hogar: 1.
- "Comercio más barato" en la lista de compras se deduce del menor `precio_pagado` registrado para ese EAN.
- La `GEMINI_API_KEY` vive solo en `localStorage` del dispositivo; nunca se commitea.
- El repo es público: no commitear la URL del Apps Script ni claves.
