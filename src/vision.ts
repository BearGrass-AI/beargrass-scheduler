// vision.ts — the screenshot reader on Workers AI. No key, no egress: the AI binding is the credential. 2026-09-16.
// Absent binding → null, and the caller falls back to "couldn't read any". The prompt lives in mail.txt (`### vision`).
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
