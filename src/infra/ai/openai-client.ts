import 'server-only';
import OpenAI from 'openai';
import { env } from '@/env';

let _client: OpenAI | undefined;

export function openaiClient(): OpenAI {
  _client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}
