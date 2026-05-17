# Spec UI — Estilo visual

Spec transversal de capa visual. Define tokens, layout, componentes y patrones.

## Referencia

Inspirado en el dashboard interno de Oceans HR (`C:\dev\oceans-hr`). Mismo lenguaje visual: púrpura profundo de marca, azul navy para títulos, asimetría de bordes redondeados en cards, layout dashboard con sidebar fija. Esta spec adapta esos tokens al dominio del challenge (solicitudes / ofertas / conciliaciones).

## Tokens

### Colores base

| Token               | Valor     | Uso                                                                   |
| ------------------- | --------- | --------------------------------------------------------------------- |
| `--brand-purple`    | `#662f8e` | Primary. Cifras grandes, sidebar active, focos.                       |
| `--company-primary` | `#662f8e` | Alias de brand-purple.                                                |
| `--brand-blue`      | `#3953a3` | Acento.                                                               |
| `--text-title`      | `#2f458a` | Títulos, labels de KPI, links primarios. Navy.                        |
| `--text-muted`      | `#65758b` | Subtítulos, captions.                                                 |
| `--text-soft`       | `#6a7282` | Texto secundario en tablas.                                           |
| `--bg-banner`       | `#edebf2` | Fondo del área de contenido, búsqueda, badges sutiles. Lavanda claro. |
| `--bg-card`         | `#ffffff` | Cards.                                                                |
| `--border-muted`    | `#a9a9a9` | Borde default de cards.                                               |
| `--border-soft`     | `#99a1af` | Borde más sutil.                                                      |
| `--border-light`    | `#d1d5db` | Divisores internos.                                                   |
| `--green`           | `#21c45d` | Éxito.                                                                |

### Estados semánticos (pills de conciliación)

| Estado               | Bg        | Text      |
| -------------------- | --------- | --------- |
| `match`              | `#dcfce7` | `#166534` |
| `partial_quantity`   | `#fef3c7` | `#92400e` |
| `missing_from_offer` | `#fee2e2` | `#991b1b` |
| `extra`              | `#dbeafe` | `#1e40af` |

Flag adicional `lowConfidence` (no es relación): badge gris `#e5e7eb` / `#374151` ` Baja confianza` que se renderiza al lado del pill de relación.

### Tipografía

Fuente única: **Inter** (vía `next/font/google`). No usar otra.

```ts
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
```

Escala:

| Uso                | Clase                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Page title         | `text-[28px] font-bold text-[#2f458a] leading-[0.85]`                |
| Page subtitle      | `text-[14px] font-normal text-[#65758b] leading-[0.85]`              |
| KPI value          | `text-[45px] font-bold leading-[51px] text-[var(--company-primary)]` |
| Card title         | `text-base font-semibold text-[#2f458a]`                             |
| Card label         | `text-sm font-semibold text-[#2f458a]`                               |
| Section pill label | `text-base font-semibold text-white`                                 |
| Body               | `text-sm text-[#6a7282]`                                             |
| Caption            | `text-xs text-[#65758b]`                                             |

## Layout

App shell tipo dashboard. Tres regiones: header, sidebar, main.

```
┌────────────────────────────────────────────────────────────┐
│  HEADER white h-24                                         │
│  [Logo + brand]    [Search bar lavanda]    [User]          │
├────────────────────────────────────────────────────────────┤
│                    [bg purple geometric]                   │
│  SIDEBAR ┌──────────────────────────────────────────────┐  │
│  (white) │  MAIN (bg #edebf2)                            │  │
│  240px   │  px-[69px] py-5                               │  │
│          │  rounded-tl-[50px] rounded-br-[50px]          │  │
│          │  overflow-y-auto                              │  │
│          │                                               │  │
│          │  [Page header con icono + título + subtítulo] │  │
│          │  [Grid de KPIs (4 cols)]                      │  │
│          │  [Grid de cards (3 cols)]                     │  │
│          └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

Detalles del shell:

- Container root: `flex flex-col h-dvh overflow-hidden`.
- Background geometric layer: `<div className="absolute inset-0 bg-[url('/bg-dashboard.png')] bg-no-repeat bg-center bg-cover z-0 pointer-events-none" />` detrás de sidebar + main.
- Main area: `rounded-tl-[50px] rounded-br-[50px] overflow-hidden bg-[#edebf2]`.
- Sidebar fija en desktop, drawer en mobile.
- Header sticky en top.

## Componentes

### StatCard (KPI)

Bordes asimétricos: top-right + bottom-left redondeados, top-left + bottom-right rectos. Es la firma visual.

```tsx
<div className="flex min-w-40 flex-1 cursor-pointer flex-col justify-between gap-[5.3px] rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#a9a9a9] bg-white p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-md">
  <div className="mb-2 flex items-start justify-between">
    <span className="text-[45px] leading-[51.233px] font-bold text-[var(--company-primary)]">
      {value}
    </span>
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#edebf2] text-[#2f458a]">
      {icon}
    </div>
  </div>
  <span className="text-base leading-4 font-semibold whitespace-pre-line text-[#2f458a]">
    {label}
  </span>
  {subtitle && (
    <span className="mt-1 text-xs leading-4 font-bold text-[var(--company-primary)]">
      {subtitle}
    </span>
  )}
</div>
```

Estado seleccionado: cambiar borde a `border-[var(--company-primary)] border-b-3` (borde inferior más grueso).

### Card de contenido

```tsx
<div className="flex-1 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-5">
  <div className="mb-6 flex items-center gap-2">
    <Icon className="h-5 w-5 text-[#2f458a]" />
    <span className="text-base leading-4 font-semibold text-[#2f458a]">{title}</span>
  </div>
  {children}
</div>
```

### Section pill (heading dentro de la grilla)

Pill de azul navy con texto blanco, anclado a la izquierda del contenido. Se usa para títulos de cards inferiores ("Actividad reciente", "Conciliaciones recientes", etc).

```tsx
<div className="inline-flex shrink-0 items-center gap-2 self-start rounded-[10px] bg-[#2f458a] px-4 py-2.5 text-white">
  <Icon className="h-5 w-5" />
  <span className="text-base font-semibold">{label}</span>
</div>
```

### Status badge (conciliación)

Pills coloreadas con la palette semántica. Sin shadcn, custom span:

```tsx
<span
  className={cn(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
    variants[relation],
  )}
>
  {labels[relation]}
</span>
```

Donde `variants`:

```ts
{
  match:               "bg-[#dcfce7] text-[#166534]",
  partial_quantity:    "bg-[#fef3c7] text-[#92400e]",
  missing_from_offer:  "bg-[#fee2e2] text-[#991b1b]",
  extra:               "bg-[#dbeafe] text-[#1e40af]",
}
// Flag adicional, no relación:
const LOW_CONFIDENCE_BADGE = "bg-[#e5e7eb] text-[#374151]";
```

### Sidebar

Fondo blanco con texto purple primario. Estructura por categorías (overview, recruitment, hr, system) adaptada al dominio:

- Home
- Solicitudes
- Ofertas (subitems: Subir, Procesadas)
- Conciliaciones
- Trazabilidad

```tsx
<Link
  href={item.href}
  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-150"
  style={
    isActive
      ? { backgroundColor: 'var(--company-primary)', color: 'white' }
      : { color: 'var(--company-primary)' }
  }
>
  <Icon className="h-5 w-5 shrink-0" />
  <span>{item.label}</span>
</Link>
```

Sub-items con tree visual (bullet point + línea vertical sutil del color primary con opacity 0.25).

### Header bar

```tsx
<header className="shrink-0 bg-white">
  <div className="flex h-24 items-center justify-between pr-6 pl-10">
    {/* Logo + brand */}
    {/* Search bar */}
    <div className="mx-6 max-w-[600px] flex-1">
      <div className="flex h-[54px] items-center gap-[18px] rounded-[25px] bg-[#edebf2] px-[27px] pr-4 text-[#65758b]">
        <SearchIcon />
        <input className="w-full border-none bg-transparent text-base text-[#101828] outline-none placeholder:text-[#65758b]" />
      </div>
    </div>
    {/* User dropdown */}
  </div>
</header>
```

Search bar con `rounded-[25px]` (muy redondo) + bg lavanda `#edebf2`. Es otra firma visual.

### Botones

- Primario: bg `#662f8e`, texto blanco, `rounded-[10px]`, `px-4 py-2.5`.
- Secundario: bg `white`, borde `#a9a9a9`, texto `#2f458a`.
- Destructivo: bg `#dc2626`, texto blanco.
- Hover: 90% opacity o shade más oscuro.

### Tabla de conciliación

Sin shadcn. Tabla nativa con estilos directos:

```tsx
<table className="w-full">
  <thead className="bg-[#edebf2]">
    <tr>
      <th className="px-4 py-3 text-left text-xs tracking-wide text-[#65758b] uppercase">...</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-[#d1d5db] hover:bg-[#f9fafb]">
      <td className="px-4 py-3 text-sm">...</td>
    </tr>
  </tbody>
</table>
```

Columnas: línea oferta, descripción ofertada, qty ofertada, item pedido (link), qty pedida, relación (badge), confianza, rationale (truncado + tooltip), acciones.

## Decisión: shadcn/ui

Cambio respecto al spec anterior. Decisión final:

**Sin shadcn/ui**. Oceans HR no lo usa y el resultado se ve consistente y limpio sin esa dependencia. Componentes custom en `components/ui/` con Tailwind. Esto:

- Reduce dependencias.
- Da control total del estilo (los detalles asimétricos no salen de un componente shadcn de fábrica).
- Es lo que ya está validado en el proyecto de referencia.

Excepciones donde sí conviene usar utilidades de terceros:

- `lucide-react` para iconos.
- `sonner` o `react-hot-toast` para toasts.
- `@radix-ui/react-dialog` raw si hace falta modal accesible (sin la capa shadcn).

## Sombras y bordes

- Cards: borde sutil (`border border-[#a9a9a9]` o `border-[#d1d5db]`), sin shadow default.
- Hover en cards interactivas: `hover:shadow-md hover:scale-[1.02] transition-all duration-200`.
- Modales: `shadow-xl`.
- La firma visual es el **borde + asimetría de corners**, no la sombra.

## Iconos

`lucide-react` con tamaño base:

- Sidebar: `w-5 h-5`.
- KPI: `w-5 h-5` o `w-6 h-6` dentro de un cuadrado `w-11 h-11 rounded-[10px] bg-[#edebf2]`.
- Botones: `w-4 h-4`.

Iconos mapeados al dominio:

- Home → `LayoutDashboard`
- Solicitudes → `FileText`
- Ofertas → `Package`
- Conciliaciones → `GitCompareArrows`
- Trazabilidad → `History` o `ScrollText`

## Páginas

### `/` Home

Header con icono `LayoutDashboard` + título "Inicio" + subtítulo "Vista general del sistema".

4 StatCards en grid `grid-cols-4 gap-4`:

1. Solicitudes activas (purple variant, icono FileText).
2. Ofertas procesadas (blue variant, icono Package).
3. Items conciliados (green variant, icono CheckCircle).
4. Cobertura promedio % (blue variant, icono TrendingUp).

Charts row con `grid` o `flex gap-4`:

- Card grande (flex-2): conciliaciones recientes (tabla con últimas 5).
- Card chica (flex-1): distribución de estados (donut: match/partial/missing/extra).

Bottom row con section pills:

- "Actividad reciente"
- "Ofertas en proceso"
- "Solicitudes con pendientes"

### `/solicitudes`

Lista de PurchaseRequest con cantidad de items y ofertas asociadas. Tabla simple o cards.

### `/solicitudes/[id]`

Header con título de solicitud + 2 KPIs (items totales, ofertas recibidas). Tabla de items pedidos. Lista de ofertas.

### `/ofertas/upload`

Drag & drop zone grande con `rounded-tr-3xl rounded-bl-3xl rounded-tl-none rounded-br-none border-2 border-dashed border-[#a9a9a9]`. Selector de solicitud target. Botón Procesar primary. Después de subir: barra de progreso con etapas (Subido → Extrayendo → Conciliando → Listo).

### `/ofertas/[id]`

Header con proveedor + fecha + archivo origen. 4 StatCards: cubiertos, faltantes, sobrantes, parciales. Tabs:

- "Oferta procesada": tabla de OfferItem.
- "Conciliación": tabla de ReconciliationLine con badges semánticos.
- "Resumen Markdown": render con `marked` + botón descargar.
- "Trazabilidad": tabla de DecisionLog expandible.

## Responsive

- Desktop ≥1024px: layout completo.
- Tablet 768-1023px: sidebar drawer.
- Mobile <768px: sidebar drawer, KPIs en 2 columnas, tablas con `overflow-x-auto`.

No es prioridad pero no debe romperse.

## Dark mode

Out of scope.

## Animaciones

- Transiciones de hover: `transition-all duration-200`.
- Scale sutil en cards hover: `hover:scale-[1.02]`.
- Sin framer-motion. Sin parallax. Sin scroll reveals.

## Accesibilidad

- Contraste AA en todos los pares texto/fondo (validado: purple sobre white = 7.2, navy sobre white = 8.1, todos OK).
- Focus visible: `focus-visible:ring-2 focus-visible:ring-[var(--company-primary)] focus-visible:ring-offset-2`.
- Botones con icono solo deben tener `aria-label`.
- Tablas con `<caption>` cuando aplique.
- Estados de loading con `aria-busy`.

## Recursos visuales necesarios

- `public/bg-dashboard.png`: imagen geométrica de fondo púrpura. Si no hay asset, generar uno con CSS (gradiente o pattern SVG inline).
- Logo del proyecto en `public/`. Placeholder: texto "OK" en bold purple.

## Estructura de archivos UI

```
src/
  app/
    layout.tsx                  # raíz con font Inter + providers
    (dashboard)/
      layout.tsx                # shell con sidebar + topbar + bg geometric
      page.tsx                  # home con KPIs + cards
      loading.tsx
      solicitudes/
        page.tsx
        [id]/page.tsx
      ofertas/
        upload/page.tsx
        [id]/
          page.tsx
          loading.tsx
          error.tsx
  components/
    layout/
      DashboardLayout.tsx
      DashboardSidebar.tsx
      DashboardHeader.tsx
    cards/
      StatCard.tsx
      DataCard.tsx
    badges/
      StatusBadge.tsx
    tables/
      ReconciliationTable.tsx
      OfferItemsTable.tsx
      DecisionLogTable.tsx
    ui/
      Button.tsx
      Input.tsx
      Badge.tsx
      SectionPill.tsx
      UploadZone.tsx
      MarkdownViewer.tsx
```

Un componente por archivo. Cada uno ≤200 líneas.

## Criterios de aceptación

- Página `/` renderiza con header + sidebar + main con corners redondeados asimétricos + 4 StatCards + 2 cards charts + 3 cards bottom.
- StatCard tiene la firma asimétrica `rounded-tr-3xl rounded-bl-3xl`.
- Badge de conciliación muestra los 5 estados con los colores semánticos definidos.
- Search bar header tiene `rounded-[25px] bg-[#edebf2]`.
- Sidebar muestra item activo con bg purple primary + texto blanco.
- Mobile (≤768px) no rompe, sidebar abre en drawer.
- Lighthouse: Performance ≥85, Accessibility ≥95.
- Sin warnings de hidratación SSR.

## Próximo

- `04-extract-xlsx.md` ya está. La siguiente funcional es `05-reconcile.md`.
