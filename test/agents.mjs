// agents.mjs — writes public/agents/index.html from public/agents.yaml: the same text, coloured for a human.
// Run after editing the YAML; a test proves the page carries the file verbatim. 2026-09-18.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const yaml = readFileSync('public/agents.yaml', 'utf8');
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const colour = (line) => {
  const m = /^(\s*)(- )?([A-Za-z_][\w]*)(:)(.*)$/.exec(line);
  const comment = (s) => s.replace(/(\s#.*)$/, '<span class="c">$1</span>');
  if (/^\s*#/.test(line)) return `<span class="c">${esc(line)}</span>`;
  if (/^\s*- /.test(line) && !m) return line.replace(/^(\s*)- (.*)$/, (_, i, v) => `${i}<span class="d">-</span> <span class="v">${comment(esc(v))}</span>`);
  if (!m) return `<span class="v">${comment(esc(line))}</span>`;
  const [, indent, dash, key, colon, rest] = m;
  const value = rest.trim() === '' ? '' : ` <span class="v">${comment(esc(rest.trimStart()))}</span>`;
  return `${indent}${dash ? '<span class="d">-</span> ' : ''}<span class="k">${esc(key)}</span><span class="d">${colon}</span>${value}`;
};
const body = yaml.split('\n').map(colour).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Scheduler, for agents</title>
<meta name="description" content="Everything an assistant needs to act on a Beargrass Scheduler email, as one YAML page a human can read too.">
<link rel="icon" href="/favicon.png">
<style>
  :root { --canvas:#0a1024; --night:#16212e; --cream:#f0e6cf; --gold:#f4c45a; --olive:#a9b87a; --barn:#d97b6b; --rule:rgba(240,230,207,.16); }
  * { box-sizing:border-box }
  body { margin:0; background:var(--canvas); color:var(--cream); font:16px/1.6 ui-monospace, Menlo, Consolas, monospace; }
  main { max-width:960px; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
  header { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1.5rem; font:15px/1.4 system-ui, sans-serif; }
  header nav a { color:var(--gold); margin-left:1.2rem; text-decoration:none } header nav a:hover { text-decoration:underline }
  pre { margin:0; white-space:pre-wrap; word-break:break-word; background:var(--night); border:1px solid var(--rule); border-radius:14px; padding:1.4rem 1.6rem; }
  .k { color:var(--gold) } .v { color:var(--cream) } .c { color:var(--olive); opacity:.85 } .d { color:var(--barn) }
  footer { margin-top:2rem; font:14px/1.5 system-ui, sans-serif; opacity:.7 }
</style>
</head>
<body>
<main>
  <header><a href="/" style="color:var(--gold);text-decoration:none;font-weight:600">the Scheduler</a><nav><a href="/agents.yaml">raw yaml</a><a href="/">the page for people</a><a href="https://github.com/BearGrass-AI/beargrass-scheduler">code</a></nav></header>
  <pre>${body}</pre>
  <footer>This page is <code>/agents.yaml</code> on this host, coloured. Fetch the raw file if you are a program; read this one if you are a person.</footer>
</main>
</body>
</html>
`;
mkdirSync('public/agents', { recursive: true });
writeFileSync('public/agents/index.html', html);
console.log('wrote public/agents/index.html');
