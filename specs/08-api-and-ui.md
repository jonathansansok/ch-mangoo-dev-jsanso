# Spec 08 — API y UI

## Objetivo

Definir rutas Next.js, server actions, route handlers y la composición de cada página. Toda la capa de interacción usuario-sistema.

## Stack

- Next.js 15 App Router, React 19.
- Server actions para mutaciones simples.
- Route handlers (`app/api/*/route.ts`) para endpoints que devuelven archivos o JSON crudo.
- `react-hook-form` + `zodResolver` para forms (alineado con oceans-hr).
- `@tanstack/react-query` para polling de estado de oferta y listados que se refrescan.
- Tailwind + componentes custom (sin shadcn, ver `ui-style.md`).

## Mapa de rutas

```
app/
  layout.tsx                          # raíz: font Inter, providers
  page.tsx                            # redirect a /home
  (dashboard)/
    layout.tsx                        # shell: sidebar + topbar + bg
    page.tsx                          # /home
    loading.tsx
    error.tsx
    solicitudes/
      page.tsx                        # /solicitudes
      loading.tsx
      [id]/
        page.tsx                      # /solicitudes/[id]
        loading.tsx
    ofertas/
      page.tsx                        # /ofertas (listado todas las ofertas)
      upload/
        page.tsx                      # /ofertas/upload
      [id]/
        page.tsx                      # /ofertas/[id] (tabs container)
        loading.tsx
        error.tsx
        not-found.tsx
  api/
    health/route.ts                   # GET /api/health
    version/route.ts                  # GET /api/version
    ofertas/[id]/
      summary/route.ts                # GET → .md descargable
      traceability/
        json/route.ts                 # GET → JSON
        csv/route.ts                  # GET → CSV
  not-found.tsx
  global-error.tsx
```

## Server actions

Ubicación: `app/(dashboard)/ofertas/actions.ts` y similares por feature. Todas con `'use server'` al inicio del archivo.

### `uploadOffer`

```ts
'use server';

const UploadOfferSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  file: z.instanceof(File).refine((f) => f.size > 0 && f.size < 10 * 1024 * 1024, 'Tamaño 1B-10MB'),
});

export async function uploadOffer(formData: FormData) {
  const parsed = UploadOfferSchema.parse({
    requestId: formData.get('requestId'),
    file: formData.get('file'),
  });

  const buffer = Buffer.from(await parsed.file.arrayBuffer());
  const hash = sha256(buffer);
  const mime = parsed.file.type;

  // Cache hit: reusar offer existente
  const cached = await prisma.extractionCache.findUnique({ where: { fileHash: hash } });

  const offer = await prisma.offer.create({
    data: {
      requestId: parsed.requestId,
      sourceFile: parsed.file.name,
      sourceFileHash: hash,
      sourceFileMime: mime,
      status: 'PENDING',
    },
  });

  // Disparar pipeline en background (no await dentro de la action para devolver rápido)
  void processOfferPipeline(offer.id, buffer);

  revalidatePath('/ofertas');
  return { offerId: offer.id };
}
```

`processOfferPipeline` corre extracción → reconcile → markdown summary. La action devuelve enseguida con el `offerId`. El cliente hace polling de status.

### `triggerReconcile`

Re-corre conciliación sobre una oferta ya extraída. Idempotente con flag `force`.

```ts
export async function triggerReconcile(offerId: number, force = false) {
  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
  if (offer.status === 'RECONCILED' && !force) return { skipped: true };
  await reconcileOffer(offerId);
  revalidatePath(`/ofertas/${offerId}`);
  return { ok: true };
}
```

### `regenerateSummary`

```ts
export async function regenerateSummary(reconciliationId: number) {
  const view = await loadReconciliationView(reconciliationId);
  const md = buildMarkdownSummary(view);
  await prisma.reconciliation.update({ where: { id: reconciliationId }, data: { summary: md } });
  revalidatePath(`/ofertas/${view.offerId}`);
  return { ok: true };
}
```

### `deleteOffer`

```ts
export async function deleteOffer(offerId: number) {
  await prisma.offer.delete({ where: { id: offerId } });
  revalidatePath('/ofertas');
  redirect('/ofertas');
}
```

## Pipeline en background

`processOfferPipeline(offerId, buffer)` corre fuera del request principal pero dentro del mismo proceso Node (Railway server persistente, no serverless).

```ts
async function processOfferPipeline(offerId: number, buffer: Buffer) {
  try {
    await setStatus(offerId, 'EXTRACTING');
    const extracted = await extractOffer(offerId, buffer);
    await persistExtracted(offerId, extracted);
    await setStatus(offerId, 'EXTRACTED');

    await setStatus(offerId, 'RECONCILING');
    await reconcileOffer(offerId);
    await setStatus(offerId, 'RECONCILED');
  } catch (err) {
    await setStatus(offerId, 'FAILED', String(err));
    logger.error({ offerId, err }, 'pipeline failed');
  }
}
```

Sin queue externa (Redis/BullMQ) en este challenge. Una promesa colgada en el event loop alcanza para el volumen esperado. Railway mantiene el proceso vivo. Out of scope: si el proceso se reinicia mid-pipeline, la oferta queda en estado intermedio. Mejora futura: queue persistente.

## Polling de estado

Cliente usa `useQuery` con `refetchInterval` mientras el estado no sea terminal:

```tsx
const { data: offer } = useQuery({
  queryKey: ['offer', offerId],
  queryFn: () => fetch(`/api/ofertas/${offerId}/status`).then((r) => r.json()),
  refetchInterval: (data) => {
    const terminal = ['RECONCILED', 'FAILED'];
    return data && terminal.includes(data.status) ? false : 2000;
  },
});
```

Endpoint `/api/ofertas/[id]/status`:

```ts
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const offer = await prisma.offer.findUniqueOrThrow({
    where: { id: Number(params.id) },
    select: { id: true, status: true, failureReason: true, updatedAt: true },
  });
  return Response.json(offer);
}
```

## Páginas

### `/home`

Datos via `prisma` directo en el Server Component (sin `useQuery`):

```tsx
export default async function HomePage() {
  const stats = await getHomeStats();
  const recentOffers = await getRecentOffers(5);
  const distribution = await getReconciliationDistribution();
  return <HomeView stats={stats} recentOffers={recentOffers} distribution={distribution} />;
}
```

`HomeView` es Client Component si tiene interactividad (filtros, hover). Si solo muestra → Server.

KPIs:

1. Solicitudes activas.
2. Ofertas procesadas (status `RECONCILED`).
3. Items conciliados (lines con `match` o `partial_quantity`).
4. Cobertura promedio % = avg de `(itemsCovered / totalRequestItems)` por oferta.

Cards inferiores:

- "Ofertas recientes": tabla con últimas 5, columnas: proveedor, solicitud, fecha, estado pill.
- "Distribución de conciliaciones": donut con totales de match/partial/missing/extra.

### `/solicitudes`

Server Component. Lista de `PurchaseRequest` con count de items y count de ofertas asociadas. Tabla simple o cards.

```tsx
const requests = await prisma.purchaseRequest.findMany({
  include: { _count: { select: { items: true, offers: true } } },
  orderBy: { createdAt: 'desc' },
});
```

### `/solicitudes/[id]`

Server Component. Header con título + 2 KPIs (items totales, ofertas recibidas). Tabla de items pedidos. Lista de ofertas con estado y link.

### `/ofertas/upload`

Client Component (form interactivo).

```tsx
'use client';
const form = useForm({ resolver: zodResolver(UploadOfferSchema) });

return (
  <form action={uploadOffer}>
    <RequestSelector name="requestId" />
    <UploadZone name="file" accept=".pdf,.xlsx,.xls" maxSize={10 * 1024 * 1024} />
    <Button type="submit" loading={form.formState.isSubmitting}>
      Procesar
    </Button>
  </form>
);
```

`UploadZone`: drag-and-drop usando HTML5 nativo (`onDrop`, `onDragOver`). Sin `@dnd-kit`, que es para reorder. Custom div con bordes asimétricos según `ui-style.md`.

Tras submit exitoso: redirect a `/ofertas/[id]` con polling activo.

### `/ofertas/[id]`

Server Component que carga la oferta + reconciliation completa. Tabs renderizadas con Client Component que maneja el `activeTab`.

```tsx
export default async function OfferPage({ params }: { params: { id: string } }) {
  const offer = await loadOfferWithEverything(Number(params.id));
  if (!offer) notFound();
  return <OfferDetail offer={offer} />;
}
```

`OfferDetail` (Client):

```tsx
const [tab, setTab] = useQueryState('tab', { defaultValue: 'oferta' });
// status polling con useQuery si el estado no es terminal

return (
  <>
    <OfferHeader offer={offer} />
    <KPIRow reconciliation={offer.reconciliation} />
    <TabBar
      tabs={['oferta', 'conciliacion', 'resumen', 'trazabilidad']}
      value={tab}
      onChange={setTab}
    />
    {tab === 'oferta' && <OfferItemsTab offer={offer} />}
    {tab === 'conciliacion' && <ReconciliationTab reconciliation={offer.reconciliation} />}
    {tab === 'resumen' && <SummaryTab reconciliation={offer.reconciliation} />}
    {tab === 'trazabilidad' && <TraceabilityTab offerId={offer.id} />}
  </>
);
```

Tabs persisten en URL con `?tab=` para que recargar mantenga el contexto.

### Tab "Resumen"

```tsx
<div>
  <div className="mb-4 flex gap-2">
    <Button onClick={download}>Descargar .md</Button>
    <Button variant="secondary" onClick={copy}>
      Copiar
    </Button>
    <Button variant="secondary" onClick={regenerate}>
      Regenerar
    </Button>
  </div>
  <MarkdownViewer source={reconciliation.summary} />
</div>
```

`MarkdownViewer` usa `marked` para render. Background blanco, padding generoso, max-width legible.

## Route handlers

### `GET /api/health`

```ts
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'ok' });
  } catch {
    return Response.json({ status: 'ok', db: 'error' }, { status: 503 });
  }
}
```

### `GET /api/version`

```ts
export async function GET() {
  return Response.json({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
    node: process.version,
    startedAt: APP_BOOT_TIME,
  });
}
```

`APP_BOOT_TIME` se setea al cargar el módulo.

### `GET /api/ofertas/[id]/summary`

Devuelve el Markdown como archivo descargable.

```ts
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const reconciliation = await prisma.reconciliation.findFirst({
    where: { offerId: Number(params.id) },
    include: { offer: { select: { sourceFile: true } } },
  });
  if (!reconciliation?.summary) return new Response('Not found', { status: 404 });

  const filename = buildSummaryFilename(reconciliation);
  return new Response(reconciliation.summary, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

### `GET /api/ofertas/[id]/traceability/json`

Devuelve todos los `DecisionLog` de la oferta.

### `GET /api/ofertas/[id]/traceability/csv`

Devuelve CSV sin prompts/responses (columnas livianas).

## Manejo de errores

### `error.tsx`

Por ruta dinámica relevante. Render con `ui-style.md`:

```tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorView title="Algo salió mal" message={error.message} onRetry={reset} />;
}
```

### `not-found.tsx`

Para `/ofertas/[id]` cuando el ID no existe.

### Form errors

Inline en el form via `react-hook-form`. Toast con `sonner` para errores de submit.

## Validación de inputs

Server actions reciben `FormData`. Toda validación con Zod schemas reutilizables desde `core/domain/`. Si la validación falla, throw que el Error Boundary o el form atrapan.

`@t3-oss/env-nextjs` o esquema propio en `src/env.ts` para env vars. Boot del server falla rápido si falta `DATABASE_URL` u `OPENAI_API_KEY`.

## Providers

`app/layout.tsx`:

```tsx
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="font-sans">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
```

`QueryProvider`: wrapper de `@tanstack/react-query` con `QueryClient` configurado.

## Performance

- Server Components para todo lo que no requiere interactividad cliente.
- `loading.tsx` por ruta para Suspense fluido.
- Streaming SSR habilitado por default en App Router.
- Sin `getServerSideProps`, sin `getStaticProps` (legacy).
- Queries Prisma con `select` explícito para evitar overfetch.
- Cache de React (`unstable_cache` o `revalidateTag`) en queries de home stats que no cambian seguido.

## Auth

Out of scope. Demo single-tenant. Si se quiere prevenir abuso: rate limit por IP con `@upstash/ratelimit` o un middleware simple in-memory. Mejora futura.

## Tests

1. `/api/health` devuelve `{ status: 'ok', db: 'ok' }` con DB sana.
2. `/api/health` devuelve 503 con DB caída (mock Prisma throws).
3. `/api/version` devuelve commit + node.
4. `/api/ofertas/[id]/summary` devuelve 404 si la oferta no tiene reconciliation, 200 con .md si sí.
5. `uploadOffer` server action crea Offer y devuelve `offerId`.
6. `uploadOffer` rechaza archivos > 10MB.
7. Polling de status: client request a `/api/ofertas/[id]/status` devuelve el estado vigente.
8. `triggerReconcile` con `force=false` no hace nada si ya está `RECONCILED`.
9. `triggerReconcile` con `force=true` re-corre.
10. `regenerateSummary` actualiza `Reconciliation.summary`.

Tests de UI: e2e con Playwright (opcional para challenge, se documenta y se hace si sobra tiempo).

## Criterios de aceptación

- Levantar `pnpm dev` y navegar a `/home` muestra el dashboard sin errores.
- Subir un PDF de fixture en `/ofertas/upload` redirige a `/ofertas/[id]` y el polling actualiza el estado hasta `RECONCILED`.
- Tabs persisten en URL (recargar mantiene tab activa).
- Health endpoint responde 200 ok.
- Descargar `summary.md` funciona desde el tab Resumen.
- Export JSON y CSV de trazabilidad funcionan.

## Out of scope

- Auth.
- Multi-tenant.
- Internacionalización (todo en es-AR).
- PWA, service worker, offline mode.
- Editar items manualmente.
- Comparar dos ofertas lado a lado.

## Próximo

- `09-testing-strategy.md`.
