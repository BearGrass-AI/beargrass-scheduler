// html.ts — the HTML part of every message: the same text as the plain part, with real line breaks and paragraphs.
// Outlook ignores `white-space: pre-wrap`, so a style is not enough (2026-09-18, a state CTO's inbox ran the ask
// together). Blank lines become paragraphs, single newlines become <br>, leading spaces stay as non-breaking
// spaces, a ``` fence becomes a monospace block, a quoted line (>) goes grey, a URL becomes a link, **x** is bold.

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]);
const link = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`);
const line = (l: string) => link(esc(l).replace(/^( +)/, m => '&nbsp;'.repeat(m.length)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));

const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;max-width:640px"; // the system face on each platform; Arial where there is none
const MONO = 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.45;background:#f4f4f2;padding:10px 12px;border-radius:6px';

export function html(text: string): string {
  const out: string[] = [];
  let para: string[] = [], fence: string[] | null = null;
  const flush = () => { if (para.length) out.push(`<p style="margin:0 0 1em">${para.map(l => /^&gt;/.test(esc(l)) ? `<span style="color:#666">${line(l)}</span>` : line(l)).join('<br>')}</p>`); para = []; };
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('```')) { if (fence) { out.push(`<div style="${MONO};margin:0 0 1em">${fence.map(line).join('<br>')}</div>`); fence = null; } else { flush(); fence = []; } continue; }
    if (fence) { fence.push(l); continue; }
    if (l.trim() === '') { flush(); continue; }
    para.push(l);
  }
  flush();
  if (fence) out.push(`<div style="${MONO}">${fence.map(line).join('<br>')}</div>`);
  return `<div style="${FONT}">${out.join('')}</div>`;
}
