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

## Modo familiar (multi-usuario)
- **Invitación:** Ajustes → "Invitar Familiar" genera `…/#invite=<base64url del JSON {scriptUrl, geminiKey?, homes}>` + QR (`qrcode-generator`, SVG) + compartir por WhatsApp (`navigator.share` / `wa.me`). Al abrir un link así, `takeInviteFromHash()` (módulo `src/invite.ts`, ejecutado una vez al cargar `store.tsx`) guarda la config, limpia el hash y el sync inicial corre de inmediato. En una PWA instalada (storage separado de Safari) se puede pegar el link en Ajustes.
- **El link contiene secretos** (URL del script y, si se tilda, la clave de Gemini): compartir solo con gente de confianza.
- **Sync:** al abrir, al volver la conexión, en `focus` y `visibilitychange` (silencioso, con piso de 3 s) y cada 25 s mientras `ShoppingListView` está abierta. Un GET que llega después de un cambio local se descarta para no pisarlo (`mutations` en el store).
- **Salida con lotes:** si hay varias unidades con distinto vencimiento/estado/ubicación se elige cuál; por defecto la ya abierta, si no la que vence primero.
- **Stock:** búsqueda por nombre/marca/categoría, filtro Sin TACC y edición de vencimiento, ubicación y precio al tocar un ítem. `precio_pagado` viaja en `UPDATE_ITEM_STATUS` y requiere que `Code.gs` lo lea; además actualiza `ultimo_precio` del catálogo.
- **Lista de compras:** `comercio_mas_barato` = comercio de la compra de menor precio unitario en `inventario`; botón de WhatsApp agrupa por comercio.

## Estadísticas y bundle
- `StatsView` (pestaña "Gastos"): gasto del mes vs. anterior (Global u hogar), desglose por comercio, inflación personal (primera vs. última compra por EAN, con precio y fechas distintas) y aprovechamiento (baja después del vencimiento = desperdicio). Todo se calcula en el cliente desde `inventario`; `fecha_ingreso` es la fecha de compra.
- `ScannerView`, `ReceiptScannerView`, `StatsView` y `QR` se cargan con `React.lazy`; `manualChunks` en `vite.config.ts` separa `react-vendor`, `scanner-lib` (html5-qrcode), `qr-lib` e `icons`. El chunk más grande (`scanner-lib`) queda bajo 500 kB, sin advertencia de Vite.

## Ticket editable y cola de envíos
- Cada renglón del ticket se edita antes de cargar: cantidad (− / +), precio unitario, "Cambiar EAN" / "Vincular EAN" y quitar (✕). El % de descuento global se aplica al cargar (`neto()`), así que se puede cambiar después de leer el ticket. Los renglones sin EAN no se cargan y se avisa cuántos son.
- Cola de POST (`store.tsx`): un error de **red** reintenta indefinidamente; un rechazo del **servidor** (`ServerRejectedError`, `status != "ok"`) descarta ese cambio, avisa con un banner ("rechazó") y sigue con los demás, para no bloquear la cola.

## Productos que no son comida
- **Tipo de producto** (Alimento / Limpieza-Hogar) en el formulario de ingreso; se guarda en `categoria` del catálogo (`Limpieza/Hogar`). Limpieza: vida útil 730 d y sin acortarla al abrir.
- **Sin vencimiento:** `dias_vida_util_cerrado = 0` en el catálogo (helpers `sinVencimiento` / `vidaCerrada` en `utils.ts`; una celda vacía NO cuenta como 0). Los ítems se guardan con `fecha_vencimiento = ''`, así que no entran en avisos, semáforo ni desperdicio (la app y `enviarResumenVencimientosDiario` ya ignoran fechas vacías). "Abrir" no toca el vencimiento.
- **Búsqueda:** Open Food Facts → Open Products Facts → Open Beauty Facts (los dos últimos se marcan como Limpieza/Hogar).
- **Sin código de barras:** botón "Agregar producto sin código" crea un EAN propio `SC-<nombre normalizado>`; mismo nombre = mismo producto. Se da de baja desde Stock (no se puede escanear).

## Convenciones y supuestos
- Estados de ítem (los que evalúa `Code.gs`): `Cerrado`, `Abierto`, `Consumido`. Un ítem está activo si no tiene `fecha_baja` y no está `Consumido`. Por compatibilidad, `En Stock` se muestra como `Cerrado` y `Baja` como `Consumido`.
- Fechas como `YYYY-MM-DD` en hora local.
- Vida útil estimada por categoría (`shelfLifeFor` en `src/utils.ts`): lácteos 20d/5d, almacén 180d/60d, entre otras.
- Stock mínimo por defecto al ingresar un producto nuevo en un hogar: 1.
- "Comercio más barato" en la lista de compras se deduce del menor `precio_pagado` registrado para ese EAN.
- La `GEMINI_API_KEY` vive solo en `localStorage` del dispositivo; nunca se commitea.
- El repo es público: no commitear la URL del Apps Script ni claves.

## Notas de operación
- **Gemini:** `src/gemini.ts` prueba `GEMINI_MODELS` (en `config.ts`) en orden y salta al siguiente si Google retira un modelo ("no longer available", 404). El botón de Ajustes muestra qué modelo respondió.
- **Búsqueda de productos:** las tres bases se piden en paralelo con tope de 3,5 s; si Open Food Facts devuelve un producto con nombre no se espera a las otras (Open Products Facts puede tardar más de 15 s).
- **Escáner:** solo EAN-13 con validación del dígito verificador (EAN-8/UPC-A generaban lecturas falsas). `ErrorBoundary` en `main.tsx` muestra el error en vez de una pantalla en blanco.

## Duplicados, borrado y edición (v2)
- **Causa de los duplicados:** en la planilla real no había `id_item` repetidos (no eran reintentos de la cola) y cada tanda tenía el mismo milisegundo en el id ⇒ una sola acción "Guardar N" con N alto (9 y 16, valores que no están entre los botones 1/2/3/6 ⇒ cantidad mal dictada por voz). Se endureció: stepper − / + visible, tope 48, confirmación si N > 6, el dictado solo toma una cantidad "suelta" ≤ 12, y `guardando` ref contra doble toque (también en "Cargar al inventario" del ticket).
- **Escáner:** anti-rebote deslizante (`last.seen`): el mismo código no se vuelve a leer hasta pasar ~2 s sin verlo (antes sumaba +1 cada 2,5 s apuntando al mismo envase en Ráfaga).
- **Idempotencia:** `ADD_INVENTORY` ignora `id_item` ya existentes (Code.gs) y el front deduplica por `id_item` (`dedupeById` en `api.ts`, al cargar y al sincronizar).
- **Eliminar ≠ Consumido:** `DELETE_ITEM` (`id_item` o `ids`) borra la fila; es idempotente (id inexistente = ok). En Stock: "Eliminar esta unidad" / "Eliminar las N unidades de este producto", con confirmación y toast "Deshacer" (reinserta las mismas filas con `ADD_INVENTORY`). El botón "Baja" se rotuló "Consumido". Las unidades ya Consumidas no se ven en Stock: se limpian a mano en la planilla.
- **Edición:** `UPDATE_ITEM_STATUS` acepta además `nombre` y `comercio`, y `ids: []` para aplicar el mismo parche a varias unidades (un solo envío). `EditItemSheet` edita la unidad (nombre, comercio, ubicación, vencimiento, precio) y, en la sección plegable "Datos del producto", el catálogo (nombre, marca, tipo, vida útil cerrado/abierto, "No vence nunca" = 0, Sin TACC) vía `UPSERT_CATALOG`. Renombrar el producto renombra también las unidades activas de ese EAN (todos los hogares; casilla desactivable). No se tocan las fechas ya cargadas.
- **Code.gs:** funciones `listarDuplicados()` (solo lectura, log) y `limpiarDuplicados()` (borra filas con `id_item` repetido dejando la primera): ejecutar a mano solo tras revisar la lista.

## Gemini (v2)
- `generate()` (`src/gemini.ts`): 503/429/500/502/504 o "high demand/overloaded/unavailable" ⇒ reintenta con espera 2 s, 5 s, 10 s y luego pasa al modelo siguiente; "retirado"/404, red y timeout ⇒ siguiente modelo; error real (clave, pedido) ⇒ corta. El mensaje final detalla cada modelo. `onStatus` muestra "Gemini está saturado… 1/3".
- Pide `generationConfig.thinkingConfig.thinkingLevel = 'low'` (3.8-flash no admite "minimal"); si da 400 por ese parámetro, reintenta sin él.
- Cadena (`GEMINI_MODELS`, verificada en la doc de Google nov-2026): 3.8-flash, 3.6-flash, flash-latest, 3.5-flash-lite, flash-lite-latest, 2.5-flash-lite, 2.5-flash (deprecado: desde el 1-dic-2026 redirige a 3.5-flash-lite). `settings.geminiModel` (Ajustes) se prueba primero. "Ver modelos disponibles para mi clave" usa `GET /v1beta/models` filtrando `generateContent`.
