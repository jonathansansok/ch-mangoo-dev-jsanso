import { http, HttpResponse } from 'msw';
import {
  bucketFor,
  lookupRequestMatch,
  normKey,
  relationForOffer,
  type MatchTable,
} from './match-table';

interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

interface OpenAIEmbedRequest {
  model: string;
  input: string | string[];
}

function makeVector(bucket: number, totalBuckets: number, extraSalt = 0): number[] {
  const dim = Math.max(totalBuckets, 8);
  const v = new Array<number>(dim).fill(0);
  v[bucket % dim] = 1;
  if (extraSalt) v[(bucket + 1) % dim] = 0.001 * extraSalt;
  return v;
}

let fallbackCounter = 1_000_000;

function fallbackBucket(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  fallbackCounter += 1;
  return 100_000 + (Math.abs(h) % 50_000) + fallbackCounter;
}

interface ParsedOfferItem {
  ref: string;
  description: string;
  candidates: Array<{ ref: string; description: string }>;
}

const CANDIDATE_RE = /\[(O\d+R\d+)\]\s*"([^"]+)"/g;
const REVERSE_CAND_RE = /\[(R\d+E\d+)\]\s*"([^"]+)"/g;

function parseJudgePrompt(prompt: string): {
  kind: 'forward' | 'reverse';
  items: ParsedOfferItem[];
} {
  const items: ParsedOfferItem[] = [];
  const sections = prompt.split(/\n\n(?=\d+\)\s*\[)/);

  for (const sect of sections) {
    const forwardMatch = sect.match(/\[(O\d+)\]\s*descripci[oó]n:\s*"([^"]+)"/);
    if (forwardMatch) {
      const ref = forwardMatch[1]!;
      const description = forwardMatch[2]!;
      const candidates: ParsedOfferItem['candidates'] = [];
      const cre = new RegExp(CANDIDATE_RE.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = cre.exec(sect)) !== null) {
        candidates.push({ ref: m[1]!, description: m[2]! });
      }
      items.push({ ref, description, candidates });
      continue;
    }
    const reverseMatch = sect.match(/\[(R\d+)\]\s*descripci[oó]n:\s*"([^"]+)"/);
    if (reverseMatch) {
      const ref = reverseMatch[1]!;
      const description = reverseMatch[2]!;
      const candidates: ParsedOfferItem['candidates'] = [];
      const cre = new RegExp(REVERSE_CAND_RE.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = cre.exec(sect)) !== null) {
        candidates.push({ ref: m[1]!, description: m[2]! });
      }
      items.push({ ref, description, candidates });
    }
  }

  const kind = items.length > 0 && items[0]!.ref.startsWith('R') ? 'reverse' : 'forward';
  return { kind, items };
}

function buildJudgeResponse(prompt: string, table: MatchTable): string {
  const parsed = parseJudgePrompt(prompt);
  const decisions: Array<{
    offerItemRef: string;
    relation: 'match' | 'partial_quantity' | 'extra';
    requestItemRef: string | null;
    confidence: number;
    rationale_short: string;
  }> = [];

  for (const item of parsed.items) {
    const targetReq = lookupRequestMatch(item.description, table);
    const relation = relationForOffer(item.description, table);

    if (!targetReq || relation === 'extra' || relation === 'missing_from_offer') {
      decisions.push({
        offerItemRef: item.ref,
        relation: 'extra',
        requestItemRef: null,
        confidence: 0.9,
        rationale_short: 'No coincide con ningún candidato',
      });
      continue;
    }

    const candidate = item.candidates.find((c) => normKey(c.description) === targetReq);
    const fallback = item.candidates[0];
    const chosen = candidate ?? fallback;
    if (!chosen) {
      decisions.push({
        offerItemRef: item.ref,
        relation: 'extra',
        requestItemRef: null,
        confidence: 0.5,
        rationale_short: 'Sin candidatos disponibles',
      });
      continue;
    }

    const finalRelation: 'match' | 'partial_quantity' =
      relation === 'partial_quantity' ? 'partial_quantity' : 'match';

    decisions.push({
      offerItemRef: item.ref,
      relation: finalRelation,
      requestItemRef: chosen.ref,
      confidence: 0.92,
      rationale_short:
        finalRelation === 'partial_quantity'
          ? 'Mismo producto, cantidad difiere'
          : 'Mismo producto, vocabulario distinto',
    });

    if (!candidate) {
      const last = decisions[decisions.length - 1]!;
      last.confidence = 0.55;
    }
  }

  if (decisions.length === 0) {
    decisions.push({
      offerItemRef: 'O1',
      relation: 'extra',
      requestItemRef: null,
      confidence: 0.5,
      rationale_short: 'Prompt sin items reconocibles',
    });
  }

  return JSON.stringify({ decisions });
}

export interface OpenAIMockOptions {
  table: MatchTable;
}

export function createOpenAIHandlers({ table }: OpenAIMockOptions) {
  return [
    http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
      const body = (await request.json()) as OpenAIEmbedRequest;
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      const dim = Math.max(table.bucketCount, 8);

      const data = inputs.map((input, idx) => {
        const bucket = bucketFor(input, table) ?? fallbackBucket(input);
        const vector = makeVector(bucket, dim, idx);
        return { object: 'embedding', index: idx, embedding: vector };
      });

      return HttpResponse.json({
        object: 'list',
        data,
        model: body.model,
        usage: { prompt_tokens: inputs.length * 4, total_tokens: inputs.length * 4 },
      });
    }),

    http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
      const body = (await request.json()) as OpenAIChatRequest;
      const userMsg = body.messages.find((m) => m.role === 'user')?.content ?? '';
      const content = buildJudgeResponse(userMsg, table);

      return HttpResponse.json({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: 0,
        model: body.model,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 200, total_tokens: 400 },
      });
    }),
  ];
}
