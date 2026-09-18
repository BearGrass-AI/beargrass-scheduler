// check.ts — the gates. Before a kickoff: is the organiser's domain invited, and did the platform authenticate it;
// has this organiser started too many meetings. Before an invite: independent checks on the chosen slot.
// Each check re-derives a fact from a different direction; the last slot check renders it for a human and re-parses it.
import { blocks, parseLine, fmtDay, fmtTime, type Iv, type Meeting } from './core';

/** A listed domain admits itself and its subdomains (a dot before the listed name), never a domain that merely ends with the same letters or has the listed name inside it. */
export const allowed = (domain: string, list: string[]) => list.some(d => domain === d || domain.endsWith(`.${d}`));

/**
 * The envelope and the From header are both forgeable. A kickoff needs the platform's own Authentication-Results,
 * the one whose authserv-id is the platform's own (a sender can carry in any header it likes), to say pass for exactly this
 * domain: dmarc=pass with header.from=domain, or dkim=pass with header.d=domain (header.i=@domain in Google's
 * shape), or spf=pass with smtp.mailfrom on it.
 */
export function authenticated(ar: string, domain: string, authserv: string): boolean {
  if (ar.trim().split(/[;\s]/)[0].toLowerCase() !== authserv.toLowerCase()) return false; // written by the platform, not carried in by the sender
  const d = domain.replace(/\./g, '\\.');
  const exact = (key: string) => new RegExp(`\\b${key}=(?:[\\w.+-]+@|@)?${d}(?=[\\s;)]|$)`, 'i').test(ar);
  return (/\bdmarc=pass\b/i.test(ar) && exact('header\\.from')) || (/\bdkim=pass\b/i.test(ar) && exact('header\\.[di]')) || (/\bspf=pass\b/i.test(ar) && exact('smtp\\.mailfrom'));
}

/** Kickoffs by one organiser, as timestamps: too many today or this month is a reason to refuse; '' admits. */
export function kickoffCap(times: number[], now: number, limits: { max_kickoffs_per_day: number; max_kickoffs_per_month: number }): string {
  const day = times.filter(t => now - t < 86400000).length, month = times.filter(t => now - t < 30 * 86400000).length;
  if (day >= limits.max_kickoffs_per_day) return `you have started ${day} meetings in the last day, and ${limits.max_kickoffs_per_day} is the limit`;
  if (month >= limits.max_kickoffs_per_month) return `you have started ${month} meetings in the last month, and ${limits.max_kickoffs_per_month} is the limit`;
  return '';
}

export function sanity([s, e]: Iv, m: Meeting, subs: Iv[][], now: number): string[] {
  const bad: string[] = [], inside = (iv: Iv[]) => iv.some(([a, b]) => a <= s && e <= b);
  if (e - s !== m.length * 60000) bad.push('its length is not the meeting length');
  if (!inside(blocks(m))) bad.push('it is outside the working hours or days');
  if (!subs.every(inside)) bad.push('it is outside someone\'s free time');
  if (s < now + m.notice * 3600000) bad.push('it is too soon');
  if (s % (m.grid * 60000)) bad.push('it is off the grid');
  const round = parseLine(`${fmtDay(s, m.zone)}, ${fmtTime(s, m.zone)} to ${fmtTime(e, m.zone)}`, m);
  if (!round || round[0] !== s || round[1] !== e) bad.push('its human rendering does not read back to the same instant');
  return bad;
}
