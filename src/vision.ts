// vision.ts — the screenshot reader on Workers AI. No key, no egress: the AI binding is the credential. 2026-09-16.
// Absent binding → null, and the caller falls back to "couldn't read any". The prompt lives in mail.txt (`### vision`).
import type { Iv } from './core';
export type Shot = { type: string; data: string }; // media type + base64
export type Vision = { run: (model: string, input: { prompt: string; image: string; max_tokens?: number }) => Promise<{ response?: string }> };

/** One call per image, at most four; the model's lines joined. `null` when nothing usable came back. */
export async function readShots(ai: Vision | undefined, model: string, shots: Shot[], ask: string): Promise<string | null> {
  if (!ai || !shots.length) return null;
  const out: string[] = [];
  for (const s of shots.slice(0, 4)) {
    const text = (await ai.run(model, { prompt: ask, image: s.data, max_tokens: 1000 })).response?.trim() ?? '';
    if (text && !/^unreadable/i.test(text)) out.push(text);
  }
  return out.length ? out.join('\n') : null;
}

/** The model lists what is busy; free is each working-hours block with the busy stretches cut out. (2026-09-18: asked for free time, the model invented it.) */
export function busyToFree(blocks: Iv[], busy: Iv[]): Iv[] {
  const out: Iv[] = [];
  for (const [s, e] of blocks) {
    let cur = s;
    for (const [a, b] of busy.filter(([a, b]) => b > s && a < e).sort((x, y) => x[0] - y[0])) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < e) out.push([cur, e]);
  }
  return out;
}
