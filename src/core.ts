// core.ts — pure logic, no I/O, no bindings. Every zone, hour, name and address arrives as an argument.
// Rewritten for a human reader 2026-09-17. Sections:
//   1. zone math   2. the reply grammar   3. the answer   4. the kickoff block   5. rendering

export type Iv = [number, number]; // a half-open interval [start, end) in epoch milliseconds
export type Hours = { start: string; end: string }; // wall clock "HH:MM" in the meeting's zone, e.g. nine to five
export type Meeting = {
  name: string; length: number; start: string; end: string; // length in minutes; start/end are YYYY-MM-DD in the zone, inclusive
  zone: string; zoneName: string; zones: Record<string, string>; // IANA zone, its display word, and the short-name map
  hours: Hours; days: number[]; place: string; grid: number; notice: number; // ISO weekdays 1–7; grid in minutes; notice in hours
};
export type Defaults = { length_minutes: number; hours: Hours; days: number[]; zone: string; zones: Record<string, string>; window_days: number; place: string; grid_minutes: number; notice_hours: number };

const MINUTE = 60_000;
const DAY = 86_400_000;
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');

// ---- 1. zone math. Wall clock ⇄ instant goes through the zone database, never through offset arithmetic.

/** The wall-clock parts of an instant in a zone. */
function parts(ms: number, zone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const p = fmt.formatToParts(new Date(ms));
  const get = (type: string) => +p.find(x => x.type === type)!.value;
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
}

/** Wall clock (year, month, day, minutes-from-midnight) in a zone → epoch ms. Two passes settle DST edges. */
export function local(y: number, m: number, d: number, mins: number, zone: string): number {
  const want = Date.UTC(y, m - 1, d, 0, mins);
  let ms = want;
  for (let pass = 0; pass < 2; pass++) {
    const p = parts(ms, zone);
    ms += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return ms;
}

const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const ymd = (day: string) => day.split('-').map(Number) as [number, number, number];
const dateStr = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

/** One [start, end) working block per working day in the window. */
export function blocks(m: Meeting): Iv[] {
  const [sy, sm, sd] = ymd(m.start), [ey, em, ed] = ymd(m.end);
  const out: Iv[] = [];
  for (let t = Date.UTC(sy, sm - 1, sd); t <= Date.UTC(ey, em - 1, ed); t += DAY) {
    const day = new Date(t);
    const isoWeekday = ((day.getUTCDay() + 6) % 7) + 1;
    if (!m.days.includes(isoWeekday)) continue;
    const at = (mins: number) => local(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), mins, m.zone);
    out.push([at(toMinutes(m.hours.start)), at(toMinutes(m.hours.end))]);
  }
  return out;
}

// ---- 2. the reply grammar: one free time per line, or an epoch range, plus the words "anytime" and "none".

const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const WEEKDAY = '(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?';
const DATE = `${WEEKDAY}(?:${MONTH}\\s+(\\d{1,2})|(\\d{1,2})/(\\d{1,2})|(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})\\s+${MONTH})(?:st|nd|rd|th)?`;
const TIME = '(noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?m\\.?)?)';
const SEP = '\\s*(?:to|until|till|-|–|—)\\s*';
const ZONE_WORD = '(?:\\s+([a-z]{2,9}))?'; // an optional trailing zone word; honoured when it is in the zone map, refused when it is not
const LINE = new RegExp(`^${DATE}\\s*[:,]?\\s*(?:(all day)|${TIME}${SEP}${TIME})${ZONE_WORD}\\s*\\.?$`, 'i');
const RANGE = new RegExp(`^${TIME}${SEP}${TIME}`, 'i');
const EPOCH = /^(\d{9,13})\s*(?:to|-|–|—|\/|,)\s*(\d{9,13})$/; // assistants send this: START-END, seconds or milliseconds
const epochMs = (n: string) => (+n < 1e11 ? +n * 1000 : +n);

/** The line that introduces quoted history. Gmail wraps it across two lines; Apple Mail quotes it. */
export const isAttribution = (line: string, next: string) =>
  /^On\b.*(wrote:|<\S*)$/i.test(line) || /^\S*> wrote:$/.test(line) || (/^On\b.*\b\d{4}\b/.test(line) && /wrote:$/.test(next));
/** A separator that Outlook and signatures put before history, in the languages we have seen or expect. */
export const isSeparator = (line: string) => /^(From:|Von:|De ?:|Da:|Van:|-----(Original Message|Ursprüngliche Nachricht|Message d'origine|Mensaje original)-----|_{10,}|Sent from my|Von meinem|Envoyé de mon|-- ?)/.test(line) || /^(Am|Le|El|Il|Op) .+(schrieb|a écrit|escribió|ha scritto|schreef)\s*:?$/.test(line);

/** Plain text of a reply. An HTML-only reply is flattened first. */
export function textOf(text: string | undefined, html: string | undefined): string {
  if (text?.trim()) return text;
  return (html ?? '')
    .replace(/<(br|\/p|\/div|\/li|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/**
 * The lines the person actually wrote.
 * Rule: read down until an attribution line or a separator; that is where history begins.
 * A ">" prefix is quoted history only once some unquoted text has been seen above it; before that it is the
 * client quoting the sender's own words (Apple Mail does this to scripted bodies), so the mark is stripped
 * and the words are kept. Found on real mail 2026-09-17.
 */
export function fresh(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const out: string[] = [];
  let sawUnquoted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoted = /^>/.test(line);
    const words = line.replace(/^(>\s?)+/, '').trim();
    const nextWords = (lines[i + 1] ?? '').replace(/^(>\s?)+/, '').trim();
    if (isAttribution(words, nextWords) || isSeparator(words)) break;
    if (quoted && sawUnquoted) break;
    if (!words) continue;
    if (!quoted) sawUnquoted = true;
    out.push(words);
  }
  return out;
}

/** Every line of the body with quote marks stripped and history markers skipped: the bottom-posting fallback. */
export function allLines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim().replace(/^(>\s?)+/, '').trim()).filter(l => l && !isSeparator(l) && !isAttribution(l, ''));
}
/** Does the line carry anything a time line would: a month, a weekday, a slash or ISO date, a clock time? */
export const timeish = (line: string) => /\d|noon|midnight/i.test(line) && /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b|\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?)\b|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}(:\d{2})?\s*[ap]\.?m\b|\d{1,2}:\d{2}|\b(noon|midnight)\b|^\d{9,13}\s*[-–—,\/]/i.test(line);

/** One typed line → the pieces the grammar reads: bullets and numbering off, a trailing year off, "from … to", "between … and", "(zone)", then split on ";" and " and ". */
export function normalise(line: string): string[] {
  let l = line.replace(/^([-•*–—]|\d+[.)])\s+/, '').replace(/^[a-z ]{1,20}:\s*(?=\S)/i, '') 
    .replace(/,?\s+20\d\d(?=[\s:,]|$)/, '').replace(/\s*\((\w+)\)\s*$/, ' $1').replace(/[.]$/, '');
  l = l.replace(/\bfrom\s+(?=\d|noon|midnight)/gi, '').replace(/\bbetween\s+(\S+)\s+and\s+/gi, '$1 to ');
  return l.split(/\s*;\s*|\s+and\s+(?=\d|noon|midnight)/i).map(x => x.trim()).filter(Boolean);
}

/** "2pm" → [840, true]; "9" → [540, false]. Without am/pm: 1–7 is afternoon, 8–12 morning, 13 and up is 24-hour. */
export function minutes(s: string): [number, boolean] {
  s = s.toLowerCase().replace(/[\s.]/g, '');
  if (s === 'noon') return [720, true];
  if (s === 'midnight') return [0, true];
  const r = /^(\d{1,2})(?::(\d{2}))?([ap]m)?$/.exec(s)!;
  let h = +r[1];
  const mi = +(r[2] || 0);
  if (r[3]) return [((h % 12) + (r[3] === 'pm' ? 12 : 0)) * 60 + mi, true];
  if (h >= 1 && h <= 7) h += 12;
  return [h * 60 + mi, false];
}

/** One line → one interval, or null when the line is not a time line. */
export function parseLine(line: string, m: Meeting): Iv | null {
  const e = EPOCH.exec(line);
  if (e) {
    const a = epochMs(e[1]), b = epochMs(e[2]);
    return b > a ? [a, b] : null;
  }
  const r = LINE.exec(line);
  if (!r) return null;
  const [, mon, d1, mo2, d2, y3, mo3, d3, d4, mon4, allDay, t1, t2, zoneWord] = r;
  const monthName = mon ?? mon4;
  const month = monthName ? MONTHS.indexOf(monthName.slice(0, 3).toLowerCase()) + 1 : +(mo2 ?? mo3);
  const day = +(d1 ?? d2 ?? d3 ?? d4);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const windowStartMonth = +m.start.slice(5, 7);
  const year = y3 ? +y3 : month < windowStartMonth ? +m.end.slice(0, 4) : +m.start.slice(0, 4); // a month before the window's first month is next year
  const weekday = /^(mon|tue|wed|thu|fri|sat|sun)/i.exec(line)?.[1].toLowerCase();
  if (weekday && 'sunmontuewedthufrisat'.indexOf(weekday) / 3 !== new Date(Date.UTC(year, month - 1, day)).getUTCDay()) return null; // "Wed Sep 22" when the 22nd is a Tuesday: refuse rather than guess
  if (zoneWord && !(zoneWord.toLowerCase() in m.zones)) return null; // "5pm GMT" with no GMT in the map: refuse rather than read it as the meeting's zone
  const zone = zoneWord ? m.zones[zoneWord.toLowerCase()] : m.zone;
  let a: number, b: number, explicit = true;
  if (allDay) [a, b] = [toMinutes(m.hours.start), toMinutes(m.hours.end)];
  else {
    [a] = minutes(t1);
    [b, explicit] = minutes(t2);
    if (b <= a && !explicit) b += 720; // "10 to 2" means 10am to 2pm
  }
  if (b <= a) return null;
  return [local(year, month, day, a, zone), local(year, month, day, b, zone)];
}

/** Clip a person's intervals to the working blocks, sort them, merge the ones that touch. */
export function clip(free: Iv[], m: Meeting): Iv[] {
  const inside: Iv[] = [];
  for (const [bs, be] of blocks(m)) {
    for (const [s, e] of free) {
      const a = Math.max(s, bs), b = Math.min(e, be);
      if (a < b) inside.push([a, b]);
    }
  }
  inside.sort((x, y) => x[0] - y[0]);
  const merged: Iv[] = [];
  for (const iv of inside) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

export type Reading = { free: Iv[]; unread: string[]; dropped: string[]; none: boolean; seen: string[] };

/** Why a parsed interval fell outside the working blocks, in words the person can act on. */
function whyDropped([a, b]: Iv, m: Meeting): string {
  const day = fmtDay(a, m.zone), inWindow = a < blocks(m)[blocks(m).length - 1]?.[1] && b > blocks(m)[0]?.[0];
  if (!inWindow) return `${day} is outside ${fmtYmd(m.start, m.zone)} to ${fmtYmd(m.end, m.zone)}`;
  const iso = ((new Date(a).getUTCDay() + 6) % 7) + 1;
  if (!m.days.includes(iso)) return `${day} is not a working day`;
  return `${day} ${fmtTime(a, m.zone)} to ${fmtTime(b, m.zone)} is outside ${fmtHours(m)} ${m.zoneName}`;
}

/**
 * Everything the grammar can make of a reply.
 * `own` is text the Scheduler itself sent this person (the example lines); those are never read as theirs when they arrive together.
 * If the fresh part carries no time-like line, the whole body is read (bottom-posted and interleaved replies).
 * A piece with a time range but no date takes the date of the previous piece ("Sep 22, 2pm to 3pm and 4pm to 5pm").
 */
export function parseReply(text: string, m: Meeting, maxLines: number, own: string[] = []): Reading {
  const mine = new Set(own.map(l => l.toLowerCase().trim()));
  const is = (l?: string) => l !== undefined && mine.has(l.toLowerCase().trim());
  const notMine = (lines: string[]) => lines.filter((l, i) => !(is(l) && (is(lines[i - 1]) || is(lines[i + 1])))); // the examples come as a block; a lone match is the person's own line (2026-09-17, a real "Tue Sep 22, 9am to noon" was dropped)
  let seen = notMine(fresh(text)).slice(0, maxLines);
  if (!seen.some(timeish)) seen = notMine(allLines(text)).slice(0, maxLines);
  const words = seen.map(l => l.toLowerCase().replace(/[.!,]/g, '').trim());
  if (words.some(l => /^(none|nothing works)$/.test(l))) return { free: [], unread: [], dropped: [], none: true, seen };
  if (words.some(l => /^any ?time$/.test(l))) return { free: blocks(m), unread: [], dropped: [], none: false, seen };
  const parsed: Iv[] = [], unread: string[] = [];
  let lastDate = '';
  for (const line of seen) {
    if (/^(any ?time|none|nothing works)\b/i.test(line) && !timeish(line)) { unread.push(line); continue; } // "Anytime Thursday": qualified, so quoted back rather than taken whole
    if (!timeish(line)) continue; // greetings, sign-offs and phone numbers are not worth quoting back
    for (const piece of normalise(line)) {
      const dated = RANGE.test(piece) && lastDate ? `${lastDate}, ${piece}` : piece;
      const iv = parseLine(dated, m);
      if (iv) { parsed.push(iv); const d = new RegExp(`^(${DATE})`, 'i').exec(piece)?.[1]; if (d) lastDate = d; }
      else unread.push(piece);
    }
  }
  const free = clip(parsed, m);
  const dropped = parsed.filter(iv => !clip([iv], m).length).map(iv => whyDropped(iv, m));
  return { free, unread, dropped, none: false, seen };
}

// ---- 3. the answer

/** The earliest grid slot inside every participant's free set, not sooner than the notice. Null when none. */
export function earliest(subs: Iv[][], m: Meeting, now: number): Iv | null {
  const len = m.length * MINUTE, floor = now + m.notice * 60 * MINUTE;
  for (const [bs, be] of blocks(m)) {
    for (let s = bs; s + len <= be; s += m.grid * MINUTE) {
      if (s < floor) continue;
      if (subs.every(free => free.some(([a, b]) => a <= s && s + len <= b))) return [s, s + len];
    }
  }
  return null;
}

export const subset = (to: string[], people: string[]) => to.every(a => people.includes(a));

// ---- 4. the kickoff's labeled block, over the defaults (layer 2 over layer 1)

export function parseKickoff(text: string, subject: string, D: Defaults, now: number): Meeting {
  const field = (label: string) => (new RegExp(`(?:^|\\s)(?:>\\s?)*${label}:[ \\t]*(.+?)(?=\\s+(?:Length|Between|Hours|Where):|$)`, 'im').exec(text) ?? [])[1]?.trim(); // stops at the next label: a client may reflow the four lines onto one // Apple Mail quotes a scripted body with "> " (seen 2026-09-17); the block is still the block
  const hoursLine = field('Hours') ?? '';
  const zoneWord = Object.keys(D.zones).find(k => new RegExp(`\\b${k}\\b`, 'i').test(hoursLine));
  const zone = D.zones[zoneWord ?? D.zone];
  const zoneName = capitalise(Object.keys(D.zones).find(k => D.zones[k] === zone && k.length > 3) ?? zoneWord ?? D.zone);
  const today = parts(now, zone);
  const range = RANGE.exec(hoursLine);
  const hours = range ? { start: toHHMM(minutes(range[1])[0]), end: toHHMM(minutes(range[2])[0]) } : D.hours;
  const found = [...(field('Between') ?? '').matchAll(new RegExp(DATE, 'gi'))];
  const dayFirst = found.some(x => x[3] && +x[3] > 12); // one "21/9" on the line makes every slash date on it day-first, so "2/10" is October 2
  const dates = found.map(x => {
    const monthName = x[1] ?? x[9];
    let month = monthName ? MONTHS.indexOf(monthName.slice(0, 3).toLowerCase()) + 1 : +(x[3] ?? x[6]), day = +(x[2] ?? x[4] ?? x[7] ?? x[8]);
    if (x[3] && dayFirst) [month, day] = [day, month];
    const year = x[5] ? +x[5] : month < today.m ? today.y + 1 : today.y;
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? dateStr(year, month, day) : '';
  }).filter(Boolean);
  const plusDays = (n: number) => { const t = new Date(Date.UTC(today.y, today.m - 1, today.d + n)); return dateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const lengthText = field('Length') ?? '';
  const number = +(/\d+(\.\d+)?/.exec(lengthText)?.[0] ?? 0);
  const unitIsHours = /^\s*[\d.]+\s*h/i.test(lengthText); // "1.5 hours", "1h30" (the 30 is dropped); "45 minutes to an hour" is minutes
  let requested = number ? (unitIsHours ? number * 60 : number) : D.length_minutes;
  if (requested < D.grid_minutes || requested > 480) requested = D.length_minutes; // nonsense lengths fall to the default
  const length = Math.ceil(requested / D.grid_minutes) * D.grid_minutes; // rounded up to the grid
  let [start, end] = [dates[0] ?? plusDays(1), dates[1] ?? plusDays(D.window_days)];
  if (end < start) [start, end] = [end, start];
  const sane = toMinutes(hours.end) > toMinutes(hours.start) ? hours : D.hours; // "7 to 3" reads as seven in the evening to three in the afternoon; fall back rather than invert
  return {
    name: subject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim(),
    length, start, end, zone, zoneName, zones: D.zones, hours: sane, days: D.days, place: field('Where') ?? D.place, grid: D.grid_minutes, notice: D.notice_hours,
  };
}

// ---- 5. rendering: templates, names, dates for people, the .ics, the links

export const render = (tpl: string, v: Record<string, unknown>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? ''));

/**
 * The pack is wrapped for the file; mail is not. A single newline inside a prose paragraph becomes a space, so the
 * reader's client wraps once, at its own width. Blank, indented, quoted, fenced and table lines keep their breaks;
 * a list item starts its own line but its indented continuation joins it. Added 2026-09-17 after an orphaned "of".
 */
export function unwrap(text: string): string {
  const hard = (l: string) => !l.trim() || /^( {4}|>|```|\|)/.test(l), starts = (l: string) => hard(l) || /^(\d+\. |- )/.test(l);
  const out: string[] = []; let fenced = false;
  for (const l of text.split('\n')) {
    if (l.startsWith('```')) fenced = !fenced;
    const prev = out[out.length - 1];
    if (!fenced && !l.startsWith('```') && prev !== undefined && !hard(prev) && !starts(l)) out[out.length - 1] = `${prev} ${l.trim()}`; else out.push(l);
  }
  return out.join('\n');
}

/** "Doe, Jane" → Jane; "Dr. Sam Lee" → Sam; no name → the local part: after a "+" if there is one, else before the first dot. */
export function firstName(name: string | undefined, address: string): string {
  const n = (name ?? '').trim().replace(/^(dr|mr|mrs|ms|prof|rev)\.?\s+/i, '');
  const local = address.split('@')[0];
  const base = n.includes(',') ? n.split(',')[1] : n || (local.includes('+') ? local.split('+').pop()! : local.split('.')[0]);
  return capitalise(base.trim().split(/\s+/)[0] || local);
}

const fmt = (zone: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: zone, ...o });
const clock = (ms: number, zone: string) => fmt(zone, { hour: 'numeric', minute: '2-digit' }).format(ms);
export const fmtDay = (ms: number, zone: string) => fmt(zone, { weekday: 'short', month: 'short', day: 'numeric' }).format(ms).replace(',', ''); // Tue Sep 22
export const fmtDate = (ms: number, zone: string) => fmt(zone, { month: 'short', day: 'numeric' }).format(ms); // Sep 22
export const fmtTime = (ms: number, zone: string) => clock(ms, zone).toLowerCase().replace(':00', '').replace(' ', ''); // 2pm, 2:30pm
export const fmtSlot = ([s, e]: Iv, m: Meeting) => `${fmt(m.zone, { weekday: 'long', month: 'long', day: 'numeric' }).format(s)}, ${clock(s, m.zone)} to ${clock(e, m.zone)} ${m.zoneName}`;
export const fmtHours = (m: Meeting) => `${fmtTime(local(2000, 1, 3, toMinutes(m.hours.start), m.zone), m.zone)} to ${fmtTime(local(2000, 1, 3, toMinutes(m.hours.end), m.zone), m.zone)}`;
/** A YYYY-MM-DD window date as a human date, in the zone. */
export const fmtYmd = (day: string, zone: string) => { const [y, mo, d] = ymd(day); return fmtDate(local(y, mo, d, 720, zone), zone); };

/** One person's times, for their own receipt. */
export const listTimes = (free: Iv[], zone: string) => free.length ? free.map(([a, b]) => `${fmtDay(a, zone)} ${fmtTime(a, zone)}–${fmtTime(b, zone)}`).join('; ') : 'none';
/** Who is free when, one line per person, for the organiser. */
export const table = (rows: { first: string; free?: Iv[] }[], zone: string) =>
  rows.map(r => `${r.first}: ${!r.free ? 'no reply yet' : r.free.length ? r.free.map(([a, b]) => `${fmtDay(a, zone)} ${fmtTime(a, zone)}–${fmtTime(b, zone)}`).join('; ') : 'none'}`).join('\n');

export const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20260924T163000Z
/** A TEXT value: backslash-escape. A parameter value such as CN: DQUOTE-quote. RFC 5545 §3.2, §3.3.11. */
export const icsText = (s: string) => s.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
/** A mailto address on a content line: no whitespace, no quotes, so a header value can never become a second line. */
export const addr = (s: string) => s.replace(/[\s"]/g, '');
export const param = (s: string) => `"${s.replace(/["\r\n]/g, '')}"`;
const encoder = new TextEncoder();
/** Fold one content line at 75 octets (74 after the continuation space). */
function fold(line: string): string {
  let out = '', cur = '', n = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (n + bytes > (out ? 74 : 75)) { out += cur + '\r\n '; cur = ''; n = 0; }
    cur += ch; n += bytes;
  }
  return out + cur;
}
export const ics = (tpl: string, v: Record<string, unknown>) => render(tpl, v).split(/\r?\n/).filter(Boolean).map(fold).join('\r\n') + '\r\n';

export function links(tpl: { google_link: string; outlook_link: string }, m: Meeting, [s, e]: Iv) {
  const v = { text: encodeURIComponent(m.name), location: encodeURIComponent(m.place), dates: `${stamp(s)}/${stamp(e)}`, start: new Date(s).toISOString(), end: new Date(e).toISOString() };
  return { google_link: render(tpl.google_link, v), outlook_link: render(tpl.outlook_link, v) };
}
