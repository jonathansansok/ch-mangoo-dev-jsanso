export const JUDGE_SYSTEM_PROMPT = [
  'Sos un asistente que decide si items ofertados por un proveedor corresponden',
  'a items pedidos en una solicitud de compra. No inventás datos. Si ninguno',
  'de los candidatos calza, devolvés relation: "extra". Tu salida es JSON',
  'estricto según el schema indicado en el mensaje del usuario.',
].join(' ');

export interface JudgeOfferItemPrompt {
  ref: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  candidates: Array<{
    ref: string;
    description: string;
    unit: string;
    quantity: number;
    score: number;
  }>;
}

const SCHEMA_HINT = `Schema esperado:
{
  "decisions": [
    {
      "offerItemRef": string,         // mismo ref que recibiste (ej. "O1")
      "relation": "match" | "partial_quantity" | "extra",
      "requestItemRef": string|null,  // ref del candidato elegido o null si extra
      "confidence": number,           // 0.0 a 1.0
      "rationale_short": string       // ≤ 280 chars, español, sin repetir descripción ni precio
    }
  ]
}`;

const RULES = [
  'Reglas:',
  '- Elegí 1 candidato si claramente es el mismo producto.',
  '- "extra" si ninguno califica (requestItemRef = null).',
  '- "partial_quantity" si es el mismo producto pero la cantidad difiere.',
  '- Confianza entre 0.0 y 1.0, calibrada por similitud descriptiva y de unidades.',
  '- rationale_short ≤ 280 chars, en español, breve, sin repetir descripción ni precio.',
].join('\n');

function formatCandidate(c: JudgeOfferItemPrompt['candidates'][number]): string {
  return `   - [${c.ref}] "${c.description}" (qty: ${c.quantity}, unit: ${c.unit}, score: ${c.score.toFixed(2)})`;
}

function formatOfferItem(o: JudgeOfferItemPrompt, idx: number): string {
  const qty = o.quantity === null ? 'n/a' : o.quantity;
  const unit = o.unit ?? 'n/a';
  const head = `${idx + 1}) [${o.ref}] descripción: "${o.description}" | unidad: "${unit}" | cantidad: ${qty}`;
  const candidates =
    o.candidates.length === 0
      ? '   candidatos: (sin candidatos)'
      : ['   candidatos:', ...o.candidates.map(formatCandidate)].join('\n');
  return `${head}\n${candidates}`;
}

export function buildJudgeUserPrompt(items: readonly JudgeOfferItemPrompt[]): string {
  return [
    'Para cada item ofertado decidí cuál (si alguno) de sus candidatos es match.',
    '',
    'Items ofertados:',
    items.map(formatOfferItem).join('\n\n'),
    '',
    RULES,
    '',
    SCHEMA_HINT,
  ].join('\n');
}
