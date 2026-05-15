# Spec UI — Estilo visual

## Referencia

Captura de referencia: dashboard tipo HR/ATS con sidebar oscuro, área principal clara, cards con KPIs y gráficos. Palette violeta como acento primario. Estética moderna, limpia, datos al frente.

Esta spec es transversal a `08-api-and-ui.md`. Define la capa visual: palette, tipografía, layout, componentes. La spec 08 define rutas y comportamiento.

## Palette

Tailwind config en `tailwind.config.ts`. Sin colores custom raros, todo apoyado en escalas estándar.

| Rol | Color | Tailwind |
|---|---|---|
| Primary | violeta vibrante | `violet-600` (#7C3AED) |
| Primary hover | violeta oscuro | `violet-700` (#6D28D9) |
| Primary light | violeta tenue | `violet-50` (#F5F3FF) |
| Sidebar bg | púrpura oscuro casi negro | `[#1F1B2E]` (custom) o `slate-900` con tint |
| Sidebar text | gris claro | `slate-300` |
| Sidebar text active | blanco sobre violet-600 | `white` |
| App bg | gris muy claro | `slate-50` (#F8FAFC) |
| Card bg | blanco | `white` |
| Card border | gris suave | `slate-200` |
| Text primary | gris muy oscuro | `slate-900` |
| Text muted | gris medio | `slate-500` |
| Divider | gris muy suave | `slate-100` |

### Estados semánticos (para pills de conciliación)

| Estado | Color bg | Color text |
|---|---|---|
| `match` | `emerald-100` | `emerald-800` |
| `partial_quantity` | `amber-100` | `amber-800` |
| `missing_from_offer` | `rose-100` | `rose-800` |
| `extra` | `sky-100` | `sky-800` |
| `low_confidence` | `slate-200` | `slate-700` |

## Tipografía

- **Fuente**: Inter (via `next/font/google`) o Geist Sans. Geist queda más moderno.
- **Mono**: Geist Mono o JetBrains Mono para códigos de proveedor y SHA.

Escala:

| Uso | Tailwind |
|---|---|
| Page title | `text-2xl font-semibold tracking-tight` |
| Section heading | `text-lg font-semibold` |
| Card label | `text-xs uppercase tracking-wide text-slate-500` |
| KPI number | `text-4xl font-bold tabular-nums` |
| Body | `text-sm text-slate-700` |
| Caption | `text-xs text-slate-500` |
| Code | `font-mono text-sm` |

## Layout

App shell con sidebar fija + área principal.

```
┌──────────────┬─────────────────────────────────────────────┐
│  Sidebar     │  Top bar: breadcrumb │ search │ user        │
│  (240px)     ├─────────────────────────────────────────────┤
│  - Home      │                                             │
│  - Solicit.  │  Main content                               │
│  - Ofertas   │  - KPI row (4 cards en grid responsive)     │
│  - Conciliac.│  - Content cards                            │
│  - Traza     │                                             │
│              │                                             │
│  Logo        │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

- Sidebar fijo en desktop (≥1024px), drawer en mobile.
- Top bar sticky en scroll.
- Main con `max-w-7xl mx-auto px-6 py-8`.
- Grid principal: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` para KPIs, `grid-cols-1 lg:grid-cols-3 gap-6` para contenido (table 2/3, summary 1/3).

## Componentes (shadcn/ui)

Usar shadcn/ui como base. Personalizar con la palette anterior. Componentes a instalar:

```
button, card, badge, table, tabs, dialog, sheet, dropdown-menu,
input, select, label, separator, scroll-area, skeleton, sonner,
progress, alert, tooltip
```

### Card de KPI

Layout interno:

```
┌──────────────────────────┐
│ LABEL EN CAPS    🟪 icon │
│                          │
│ 220                      │
│                          │
│ +12% vs últ. semana      │
└──────────────────────────┘
```

- Card con `p-5 rounded-2xl border bg-white shadow-sm`.
- Label arriba: `text-xs uppercase tracking-wide text-slate-500`.
- Icono arriba derecha en círculo coloreado: `w-10 h-10 rounded-xl bg-violet-100 text-violet-600 grid place-items-center`.
- Número: `text-4xl font-bold tabular-nums mt-3`.
- Sub-label: `text-xs text-slate-500 mt-1`.

### Card de datos

- Mismo wrapper que KPI pero `p-6`.
- Header con título + acción opcional (botón "ver más", dropdown).
- Content: chart, tabla o lista.

### Sidebar

- Bg `bg-[#1F1B2E]` o `bg-slate-900`.
- Items: `flex items-center gap-3 px-4 py-2.5 rounded-lg`.
- Item activo: `bg-violet-600 text-white`.
- Item hover: `bg-slate-800 text-white`.
- Sección label: `text-xs uppercase tracking-wider text-slate-500 px-4 mt-6 mb-2`.
- Logo abajo con `mt-auto`.

### Top bar

- `h-16 flex items-center px-6 border-b bg-white sticky top-0 z-10`.
- Izquierda: breadcrumb o título.
- Centro: search (opcional, ocultable).
- Derecha: avatar dropdown.

### Tabla de conciliación

- `<Table>` de shadcn.
- Header `text-xs uppercase tracking-wide text-slate-500 bg-slate-50`.
- Filas con `border-b border-slate-100` y hover `bg-slate-50`.
- Columna de relación con `<Badge>` de la palette semántica.
- Columna de qty con `tabular-nums text-right`.
- Columna de rationale con `text-slate-600 max-w-md truncate` + tooltip.
- Acción al final: botón con icono para ver detalle (abre Sheet).

### Status pill

```tsx
<Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
  Match
</Badge>
```

Variantes para los 5 estados semánticos definidos arriba.

### Estados de carga

- KPIs con `<Skeleton className="h-24 w-full rounded-2xl" />`.
- Tablas con `<Skeleton className="h-12 w-full" />` × N.
- Botones de upload con spinner inline (`Loader2` de `lucide-react`).

## Sombras y bordes

- Cards: `shadow-sm border border-slate-200`.
- Hover en cards interactivas: `hover:shadow-md transition-shadow`.
- Modales: `shadow-xl`.
- Sin sombras agresivas. Borde sutil es preferido para look moderno.

## Iconos

- `lucide-react`. Tamaño base `w-5 h-5`.
- Sidebar: `w-5 h-5`.
- KPI: `w-5 h-5` dentro de círculo `w-10 h-10`.
- Botones: `w-4 h-4`.

Iconos sugeridos por sección:

- Home: `LayoutDashboard`
- Solicitudes: `FileText`
- Ofertas: `Package`
- Conciliaciones: `GitCompare`
- Trazabilidad: `History`

## Páginas mapeadas al dominio

### `/` Home

- Top bar: "Resumen general".
- 4 KPIs: Solicitudes activas, Ofertas procesadas, Items conciliados, % cobertura promedio.
- Card "Ofertas recientes" (tabla con últimas 5).
- Card "Estado de conciliación" (donut: match/partial/missing/extra).

### `/solicitudes`

- Lista de solicitudes con cantidad de items y ofertas asociadas.

### `/solicitudes/[id]`

- Header con título de solicitud.
- Tabla de items pedidos.
- Lista de ofertas recibidas con estado.

### `/ofertas/upload`

- Drag & drop zone grande.
- Selector de solicitud target.
- Botón "Procesar".
- Después de subir: progress bar con etapas (Subido → Extrayendo → Conciliando → Listo).

### `/ofertas/[id]`

- Header con proveedor, fecha, archivo origen.
- 4 KPIs: items cubiertos, faltantes, sobrantes, parciales.
- Tabs:
  - "Oferta procesada": tabla de OfferItem.
  - "Conciliación": tabla de ReconciliationLine con pills semánticas.
  - "Resumen Markdown": render del markdown + botón descargar.
  - "Trazabilidad": tabla de DecisionLog con detalle expandible.

## Responsive

- Desktop ≥1024px: layout completo con sidebar.
- Tablet 768-1023px: sidebar colapsable en drawer.
- Mobile <768px: sidebar drawer, KPIs en 2 columnas, tablas con scroll horizontal.

Mobile no es prioridad de challenge pero no debe romperse. Tablas con `overflow-x-auto`.

## Dark mode

Out of scope para este challenge. Solo light. Si el evaluador lo pide, se agrega después con `next-themes`.

## Animaciones

- Transiciones de hover: `transition-colors duration-150`.
- Aparición de cards: sin animación intrusiva.
- Sheet/Dialog: animación default de shadcn.
- Sin scroll reveal, sin paralaje, sin librerías de animación pesadas. `framer-motion` solo si surge un caso específico.

## Accesibilidad

- Contraste AA mínimo en todos los pares texto/fondo.
- Foco visible con `focus-visible:ring-2 ring-violet-600 ring-offset-2`.
- Botones con labels accesibles (`aria-label` cuando solo hay icono).
- Tablas con `<caption>` cuando aplique.
- Estados de loading con `aria-busy`.

shadcn/ui ya cubre Radix accesible por default. No romperlo.

## Recursos visuales

- Logo placeholder: texto "OK" con tipografía bold en violet, hasta que haya brand.
- Favicon: monograma similar.
- Sin imágenes stock, sin gradientes recargados.

## Estructura de archivos UI

```
src/
  app/
    layout.tsx                  # raíz con fonts + providers
    (dashboard)/
      layout.tsx                # shell con sidebar + topbar
      page.tsx                  # home con KPIs
      solicitudes/
        page.tsx
        [id]/page.tsx
      ofertas/
        upload/page.tsx
        [id]/
          page.tsx              # tabs container
          loading.tsx
          error.tsx
  components/
    ui/                         # shadcn/ui generated
    layout/
      sidebar.tsx
      topbar.tsx
    kpi-card.tsx
    status-badge.tsx
    offer-table.tsx
    reconciliation-table.tsx
    markdown-viewer.tsx
    upload-zone.tsx
    decision-log-table.tsx
```

Un componente por archivo. Cada uno ≤200 líneas.

## Criterios de aceptación

- Página `/` renderiza con sidebar + topbar + 4 KPIs + 2 cards.
- Tabla de conciliación muestra los 5 estados con pills correctas.
- Subir un PDF dispara la zona drag & drop con feedback visual.
- Mobile (≤768px) no rompe, sidebar abre en drawer.
- Lighthouse: Performance ≥85, Accessibility ≥95, Best Practices ≥95.
- Sin warnings de hidratación SSR.

## Próximo

- `04-extract-xlsx.md` retoma el flujo de specs funcionales. Esta spec UI se referencia desde `08-api-and-ui.md`.
