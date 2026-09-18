// Tests over core.ts, check.ts, vision.ts, the copy doc, and the greps. Zones, hours and addresses are fixtures here, never in src/.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../src/core';
import { sanity, allowed, authenticated, kickoffCap } from '../src/check';
import { html } from '../src/html';
import { readShots } from '../src/vision';
import D from '../src/defaults.json';

const Z = 'America/Denver';
const M: C.Meeting = { name: 'Introductions', length: 30, start: '2026-09-21', end: '2026-10-02', zone: Z, zoneName: 'Mountain', zones: D.zones, hours: { start: '09:00', end: '17:00' }, days: [1, 2, 3, 4, 5], place: 'Google Meet', grid: 15, notice: 24 };
const L = (m: number, d: number, h: number, mi = 0) => C.local(2026, m, d, h * 60 + mi, Z);

describe('one line of the reply grammar', () => {
  it.each<[string, C.Iv]>([
    ['Tue Sep 22, 2pm to 5pm', [L(9, 22, 14), L(9, 22, 17)]],
    ['Thu Sep 24, 9am to noon', [L(9, 24, 9), L(9, 24, 12)]],
    ['Mon Sep 28, all day', [L(9, 28, 9), L(9, 28, 17)]],
    ['9/30, 1:30pm-3pm', [L(9, 30, 13, 30), L(9, 30, 15)]],
    ['September 22 2pm to 5pm', [L(9, 22, 14), L(9, 22, 17)]],
    ['2026-09-22, 14:00 to 15:30', [L(9, 22, 14), L(9, 22, 15, 30)]],
    ['Sep 22, 9 to noon', [L(9, 22, 9), L(9, 22, 12)]],
    ['Sep 22, 2 to 5', [L(9, 22, 14), L(9, 22, 17)]],
    ['Sep 22, 10 to 2pm', [L(9, 22, 10), L(9, 22, 14)]],
    ['Sep 22 10am until 11:30am', [L(9, 22, 10), L(9, 22, 11, 30)]],
    ['Tue, Sep 22, 2pm – 5pm', [L(9, 22, 14), L(9, 22, 17)]],
    ['Sep 22nd, 9:15am to 10am', [L(9, 22, 9, 15), L(9, 22, 10)]],
    ['Wed Sep 23: 1pm to 2pm', [L(9, 23, 13), L(9, 23, 14)]],
    ['Sep 22, 8 to 9', [L(9, 22, 8), L(9, 22, 9)]],
    ['Sep 22, 11 to 1', [L(9, 22, 11), L(9, 22, 13)]],
    ['Sep 22, 7am to 8', [L(9, 22, 7), L(9, 22, 8)]],
    ['Sep 22, 2:00 p.m. to 3:00 p.m.', [L(9, 22, 14), L(9, 22, 15)]],
    ['9/22 2pm to 5pm.', [L(9, 22, 14), L(9, 22, 17)]],
    ['Fri Oct 2, midnight to noon', [L(10, 2, 0), L(10, 2, 12)]],
    ['Thu Sep 24, 10am to 11am MT', [L(9, 24, 10), L(9, 24, 11)]],
    ['Sep 22, 2pm to 5pm Mountain', [L(9, 22, 14), L(9, 22, 17)]],
    ['Sep 22, 2pm to 5pm PT', [L(9, 22, 15), L(9, 22, 18)]],
    ['Sep 22, 2pm to 5pm Eastern', [L(9, 22, 12), L(9, 22, 15)]],
    [`${L(9, 22, 14) / 1000}-${L(9, 22, 17) / 1000}`, [L(9, 22, 14), L(9, 22, 17)]],
    [`${L(9, 24, 9)} to ${L(9, 24, 12)}`, [L(9, 24, 9), L(9, 24, 12)]],
    ['22 Sep, 2pm to 5pm', [L(9, 22, 14), L(9, 22, 17)]],
    ['Sep 22, 2pm to 5pm GMT', [L(9, 22, 8), L(9, 22, 11)]],
  ])('%s', (line, want) => expect(C.parseLine(line, M)).toEqual(want));
  it.each(['Tuesday afternoon', 'Sep 22', 'sometime next week', 'Sep 22, 5pm to 2pm', `${L(9, 22, 17) / 1000}-${L(9, 22, 14) / 1000}`, 'Wed Sep 22, 2pm to 5pm', 'Sep 22, 2pm to 5pm Moontime', '22/9, 2pm to 5pm'])('refuses %s', l => expect(C.parseLine(l, M)).toBeNull());
});

describe('what the person actually wrote (fresh)', () => {
  it("keeps a body the client quoted as the sender's own text: Apple Mail, 2026-09-17", () => {
    expect(C.fresh('> Thu Sep 24, 10am to 11am MT\n> Mon Sep 28, 1pm to 3pm')).toEqual(['Thu Sep 24, 10am to 11am MT', 'Mon Sep 28, 1pm to 3pm']);
  });
  it('drops quoted history once unquoted text has been seen', () => {
    expect(C.fresh('Tue Sep 22, 2pm to 5pm\n\n> Mon Sep 21, all day\n> more')).toEqual(['Tue Sep 22, 2pm to 5pm']);
  });
  it.each([
    'On Tue, Sep 16, 2026 at 6:21 PM Sam wrote:',
    'On Wed, Sep 16, 2026 at 8:50 PM Beargrass Scheduler <',
    '<meet+abc@x.org> wrote:',
    'From: Sam Ridge',
    '-----Original Message-----',
    '________________________________',
    'Sent from my iPhone',
    '--',
  ])('stops at %s', marker => {
    expect(C.fresh(`Tue Sep 22, 2pm to 5pm\n${marker}\nThu Sep 24, 9am to noon`)).toEqual(['Tue Sep 22, 2pm to 5pm']);
  });
  it('a Gmail attribution wrapped before the address is one marker, not content', () => {
    expect(C.fresh('Tue Sep 22, 2pm to 5pm\nOn Wed, Sep 16, 2026 at 8:50 PM Beargrass Scheduler for Sam\n<meet+abc@x.org> wrote:\n> old')).toEqual(['Tue Sep 22, 2pm to 5pm']);
  });
  it('a quoted attribution line (Apple Mail reply) ends the fresh part', () => {
    expect(C.fresh('Thu Sep 24, 10:30am to noon\n\n> On Sep 16, 2026, at 8:50 PM, X <a@b.c> wrote:\n> Tue Sep 22, 2pm to 5pm')).toEqual(['Thu Sep 24, 10:30am to noon']);
  });
  it('flattens an HTML-only reply', () => {
    expect(C.textOf(undefined, '<div dir="ltr">Hi Sam,<br>Tue Sep 22, 2pm &amp; 5pm<br></div><p>Thanks</p>')).toBe('Hi Sam,\nTue Sep 22, 2pm & 5pm\n\nThanks\n');
    expect(C.textOf('plain', '<b>html</b>')).toBe('plain');
  });
});

describe('the shapes people and assistants actually type (normalise)', () => {
  it.each<[string, string[]]>([
    ['- Tue Sep 22, 2pm to 5pm', ['Tue Sep 22, 2pm to 5pm']],
    ['Available: Tue Sep 22, 2pm to 5pm', ['Tue Sep 22, 2pm to 5pm']],
    ['Wed Sep 23: 1pm to 2pm', ['Wed Sep 23: 1pm to 2pm']],
    ['1. Tue Sep 22, 2pm to 5pm', ['Tue Sep 22, 2pm to 5pm']],
    ['Tuesday, September 22, 2026: 2:00 PM – 5:00 PM', ['Tuesday, September 22: 2:00 PM – 5:00 PM']],
    ['Sep 22 from 2 to 5', ['Sep 22 2 to 5']],
    ['Sep 22 between 2 and 5pm', ['Sep 22 2 to 5pm']],
    ['Sep 22, 2pm to 5pm (Mountain)', ['Sep 22, 2pm to 5pm Mountain']],
    ['Sep 22, 2pm-5pm; Sep 23, 9am-noon', ['Sep 22, 2pm-5pm', 'Sep 23, 9am-noon']],
    ['Sep 22, 2pm to 3pm and 4pm to 5pm', ['Sep 22, 2pm to 3pm', '4pm to 5pm']],
  ])('%s', (line, want) => expect(C.normalise(line)).toEqual(want));
  it('a dateless second range takes the date of the first', () => {
    expect(C.parseReply('Sep 22, 2pm to 3pm and 4pm to 5pm', M, 60).free).toEqual([[L(9, 22, 14), L(9, 22, 15)], [L(9, 22, 16), L(9, 22, 17)]]);
  });
  it('a real line that happens to equal one example is still the person\'s: Gmail, 2026-09-17', () => {
    const own = ['Mon Sep 21, 2pm to 5pm', 'Tue Sep 22, 9am to noon', 'Wed Sep 23, all day'];
    const r = C.parseReply('Mon Sep 21, 1pm to 5pm\nTue Sep 22, 9am to noon\nThu Sep 24, 9am to 5pm\n\n> On Sep 17, Beargrass SchedBot wrote:\n> Hi Sam,', M, 60, own);
    expect(r.free).toEqual([[L(9, 21, 13), L(9, 21, 17)], [L(9, 22, 9), L(9, 22, 12)], [L(9, 24, 9), L(9, 24, 17)]]);
  });
  it('the ask\'s own example lines are never the person\'s times; a German Outlook reply with no quote marks', () => {
    const own = ['Mon Sep 21, 2pm to 5pm', 'Tue Sep 22, 9am to noon', 'Wed Sep 23, all day'];
    const text = 'Passt mir.\nThu Sep 24, 10am to 11am\n\nVon: Beargrass Scheduler\nGesendet: Mittwoch\n\n    Mon Sep 21, 2pm to 5pm\n    Tue Sep 22, 9am to noon\n    Wed Sep 23, all day';
    expect(C.parseReply(text, M, 60, own).free).toEqual([[L(9, 24, 10), L(9, 24, 11)]]);
    const noSeparator = 'Danke\n\n    Mon Sep 21, 2pm to 5pm\n    Tue Sep 22, 9am to noon\n    Wed Sep 23, all day';
    expect(C.parseReply(noSeparator, M, 60, own).free).toEqual([]);
  });
  it('a bottom-posted reply is read from below the quote', () => {
    const text = '> On Sep 16, 2026, at 8:50 PM, Beargrass Scheduler wrote:\n> Reply with every time you are free\n\nThu Sep 24, 10am to 11am\nMon Sep 28, 1pm to 3pm';
    expect(C.parseReply(text, M, 60).free).toEqual([[L(9, 24, 10), L(9, 24, 11)], [L(9, 28, 13), L(9, 28, 15)]]);
  });
  it('a line that parses but falls outside comes back with a reason', () => {
    const r = C.parseReply('Sat Sep 26, 10am to noon\nOct 5, 2pm to 5pm\nSep 22, 7 to 8', M, 60);
    expect(r.free).toEqual([]);
    expect(r.dropped).toEqual(['Sat Sep 26 is not a working day', 'Mon Oct 5 is outside Sep 21 to Oct 2', 'Tue Sep 22 7pm to 8pm is outside 9am to 5pm Mountain']);
  });
  it('phone numbers and office numbers are not quoted back as unreadable', () => {
    expect(C.parseReply('Tue Sep 22, 2pm to 5pm\nErin Hale | 406-555-1234\nOffice 214, Main Hall', M, 60).unread).toEqual([]);
  });
});

describe('a whole reply (parseReply)', () => {
  it('greetings ignored, unreadable kept, everything seen', () => {
    const r = C.parseReply('Hi Sam,\nTue Sep 22, 2pm to 5pm\nTuesday 2pm-ish\nThanks!', M, 60);
    expect(r.free).toEqual([[L(9, 22, 14), L(9, 22, 17)]]);
    expect(r.unread).toEqual(['Tuesday 2pm-ish']);
    expect(r.seen).toHaveLength(4);
    expect(r.dropped).toEqual([]);
  });
  it('anytime and none on a digit-free line; a line with a digit is a time line', () => {
    expect(C.parseReply('Anytime!', M, 60).free).toEqual(C.blocks(M));
    expect(C.parseReply('Hi Sam,\nanytime.\nThanks', M, 60).free).toEqual(C.blocks(M));
    expect(C.parseReply('Anytime Thursday', M, 60)).toMatchObject({ free: [], unread: ['Anytime Thursday'] });
    expect(C.parseReply('Anytime after 2pm', M, 60).free).toEqual([]);
    expect(C.parseReply('None.', M, 60).none).toBe(true);
    expect(C.parseReply('Hi Sam,\nnone\nsorry', M, 60).none).toBe(true);
    expect(C.parseReply('None of next week works for me.\nTue Sep 29, 2pm to 5pm', M, 60)).toMatchObject({ none: false, free: [[L(9, 29, 14), L(9, 29, 17)]] });
    expect(C.parseReply('', M, 60)).toEqual({ free: [], unread: [], dropped: [], none: false, seen: [] });
  });
  it('clips to working days and hours and merges touching times', () => {
    expect(C.clip([C.parseLine('Sat Sep 26, 10am to noon', M)!], M)).toEqual([]);
    expect(C.clip([C.parseLine('Sep 22, 7am to 10am', M)!], M)).toEqual([[L(9, 22, 9), L(9, 22, 10)]]);
    expect(C.clip([[L(9, 22, 10), L(9, 22, 11)], [L(9, 22, 9), L(9, 22, 10)]], M)).toEqual([[L(9, 22, 9), L(9, 22, 11)]]);
  });
});

describe('days, hours and the answer', () => {
  it('one block per working day in the window', () => {
    const b = C.blocks(M);
    expect(b).toHaveLength(10);
    expect(b[0]).toEqual([L(9, 21, 9), L(9, 21, 17)]);
    expect(C.blocks({ ...M, days: [6, 7] })).toHaveLength(2);
  });
  it('a DST change inside the window (2026-11-01) is handled by the zone, not arithmetic', () => {
    const b = C.blocks({ ...M, start: '2026-10-26', end: '2026-11-06' });
    expect(b.find(([s]) => s === Date.UTC(2026, 9, 30, 15))).toBeTruthy();
    expect(b.find(([s]) => s === Date.UTC(2026, 10, 2, 16))).toBeTruthy();
  });
  const A: C.Iv[] = [[L(9, 22, 14), L(9, 22, 17)], [L(9, 24, 9), L(9, 24, 12)]];
  const B: C.Iv[] = [[L(9, 22, 16), L(9, 22, 17)], [L(9, 24, 10), L(9, 24, 11)]];
  it('earliest common slot on the grid', () => expect(C.earliest([A, B], M, L(9, 20, 9))).toEqual([L(9, 22, 16), L(9, 22, 16, 30)]));
  it('notice hours push the floor forward', () => expect(C.earliest([A, B], M, L(9, 22, 10))).toEqual([L(9, 24, 10), L(9, 24, 10, 30)]));
  it('an empty set blocks the answer', () => expect(C.earliest([A, B, []], M, L(9, 20, 9))).toBeNull());
  it('the gate before an invite', () => {
    expect(sanity([L(9, 22, 16), L(9, 22, 16, 30)], M, [A, B], L(9, 20, 9))).toEqual([]);
    expect(sanity([L(9, 22, 8), L(9, 22, 8, 30)], M, [A, B], L(9, 20, 9))).toContain('it is outside the working hours or days');
    expect(sanity([L(9, 22, 16), L(9, 22, 17)], M, [A, B], L(9, 20, 9))).toContain('its length is not the meeting length');
    expect(sanity([L(9, 22, 16, 5), L(9, 22, 16, 35)], M, [A, B], L(9, 20, 9))).toContain('it is off the grid');
    expect(sanity([L(9, 22, 16), L(9, 22, 16, 30)], M, [A, B], L(9, 22, 10))).toContain('it is too soon');
  });
  it('the recipient predicate', () => {
    expect(C.subset(['a@x.org'], ['a@x.org', 'b@x.org'])).toBe(true);
    expect(C.subset(['c@x.org'], ['a@x.org', 'b@x.org'])).toBe(false);
  });
});

describe('the kickoff block over the defaults', () => {
  it('reads the four lines even when a mail client reflowed them onto one line (the picker, 2026-09-17)', () => {
    const m = C.parseKickoff('Hi all Length: 45 minutes Between: Oct 5 and Oct 16 Hours: 9am to 5pm Mountain Where: Google Meet', 'Sync', D, Date.UTC(2026, 8, 17));
    expect([m.length, m.start, m.end, m.place]).toEqual([45, '2026-10-05', '2026-10-16', 'Google Meet']);
  });
  const now = Date.UTC(2026, 8, 16, 12);
  it('layer 2 wins', () => {
    const m = C.parseKickoff('Hey,\nLength: 45 minutes\nBetween: Nov 3 and Nov 10\nHours: 8am to 4pm Pacific Time\nWhere: Zoom\n', 'Re: Re: Introductions', D, now);
    expect(m).toMatchObject({ name: 'Introductions', length: 45, start: '2026-11-03', end: '2026-11-10', zone: 'America/Los_Angeles', zoneName: 'Pacific', hours: { start: '08:00', end: '16:00' }, place: 'Zoom', days: D.days });
  });
  it('layer 1 fills what the email left out', () => {
    const m = C.parseKickoff('Let us find a time.', 'Fwd: Coffee', D, now);
    expect(m).toMatchObject({ name: 'Coffee', length: 30, start: '2026-09-17', end: '2026-09-30', zone: 'America/Denver', zoneName: 'Mountain', hours: D.hours, place: D.place });
  });
  it('an hour is sixty minutes, a length rounds up to the grid, MT is Mountain', () => {
    expect(C.parseKickoff('Length: 1 hour\nHours: 9am to 5pm MT', 'x', D, now)).toMatchObject({ length: 60, zone: 'America/Denver', zoneName: 'Mountain' });
    expect(C.parseKickoff('Length: 20 minutes', 'x', D, now).length).toBe(30);
    expect(C.parseKickoff('Length: 1.5 hours', 'x', D, now).length).toBe(90);
  });
  it('a kickoff whose lines Apple Mail quoted with "> " still carries its block', () => {
    expect(C.parseKickoff('> Second walk.\n> \n> Length: 45 minutes\n> Between: Sep 21 and Oct 2\n> Hours: 9am to 5pm Mountain\n> Where: Zoom', 'x', D, now)).toMatchObject({ length: 45, start: '2026-09-21', end: '2026-10-02', place: 'Zoom' });
  });
  it('dates before today roll into next year', () => expect(C.parseKickoff('Between: Jan 5 and Jan 12', 'x', D, now)).toMatchObject({ start: '2027-01-05', end: '2027-01-12' }));
  it('day-first dates, an inverted range, inverted hours and nonsense lengths do not produce an impossible meeting', () => {
    expect(C.parseKickoff('Between: 21 Sep and 2 Oct', 'x', D, now)).toMatchObject({ start: '2026-09-21', end: '2026-10-02' });
    expect(C.parseKickoff('Between: 21/9 and 2/10', 'x', D, now)).toMatchObject({ start: '2026-09-21', end: '2026-10-02' });
    expect(C.parseKickoff('Between: Oct 2 and Sep 21', 'x', D, now)).toMatchObject({ start: '2026-09-21', end: '2026-10-02' });
    expect(C.parseKickoff('Hours: 7 to 3', 'x', D, now).hours).toEqual(D.hours);
    expect(C.parseKickoff('Length: 45 minutes to an hour', 'x', D, now).length).toBe(45);
    expect(C.parseKickoff('Length: 5000 minutes', 'x', D, now).length).toBe(30);
  });
});

describe('the kickoff gates', () => {
  const list = ['beargrassai.com', 'example.org'];
  it('a listed domain admits itself and its subdomains, nothing that merely contains it', () => {
    expect(allowed('example.org', list)).toBe(true); expect(allowed('mso.example.org', list)).toBe(true);
    expect(allowed('notexample.org', list)).toBe(false); expect(allowed('example.org.evil', list)).toBe(false); expect(allowed('', list)).toBe(false);
  });
  it('authenticates the exact From domain, only in a result written by the platform itself', () => {
    const cf = 'mx.cloudflare.net; dkim=pass header.d=mso.example.org; spf=pass smtp.mailfrom=mso.example.org; dmarc=pass header.from=mso.example.org';
    const google = 'mx.google.com; dkim=pass header.i=@mso.example.org header.s=selector1 header.b=abc123; arc=pass (i=1 spf=pass spfdomain=mso.example.org dkim=pass dkdomain=mso.example.org dmarc=pass fromdomain=mso.example.org); spf=pass smtp.mailfrom=someone@mso.example.org';
    expect(authenticated(cf, 'mso.example.org', 'mx.cloudflare.net')).toBe(true);
    expect(authenticated(google, 'mso.example.org', 'mx.google.com')).toBe(true); // Google's header.i shape, for a fork that receives there
    expect(authenticated(cf, 'example.org', 'mx.cloudflare.net')).toBe(false); // the parent domain is not the From domain
    expect(authenticated(cf, 'mso.example.org', 'mx.google.com')).toBe(false); // right words, wrong authserv: a sender's own header
    expect(authenticated('evil.example; ' + cf, 'mso.example.org', 'mx.cloudflare.net')).toBe(false); // the platform's id must lead
    expect(authenticated('mx.cloudflare.net; dkim=pass header.d=mso.example.org.evil; dmarc=fail', 'mso.example.org', 'mx.cloudflare.net')).toBe(false);
    expect(authenticated('', 'mso.example.org', 'mx.cloudflare.net')).toBe(false);
  });
  it('caps one organiser by day and by month, and forgets older kickoffs', () => {
    const limits = { max_kickoffs_per_day: 2, max_kickoffs_per_month: 3 }, now = Date.UTC(2026, 8, 17, 12), H = 3600000;
    expect(kickoffCap([], now, limits)).toBe('');
    expect(kickoffCap([now - H], now, limits)).toBe('');
    expect(kickoffCap([now - H, now - 2 * H], now, limits)).toMatch(/2 meetings in the last day/);
    expect(kickoffCap([now - 2 * 24 * H, now - 3 * 24 * H, now - 4 * 24 * H], now, limits)).toMatch(/3 meetings in the last month/);
    expect(kickoffCap([now - 31 * 24 * H, now - 32 * 24 * H, now - 33 * 24 * H], now, limits)).toBe('');
  });
});

describe('rendering', () => {
  it('strips whitespace and quotes from an address bound for a calendar line', () => expect(C.addr('mark@x.org\r\nX-INJECTED:evil "q"')).toBe('mark@x.orgX-INJECTED:evilq'));
  it('the HTML part carries real breaks: paragraphs, <br>, indented lines, a fenced block, a grey quote (Outlook ignores pre-wrap)', () => {
    const h = html('Hi Erin,\n\nlike\n\n    Mon Oct 5, 2pm to 5pm\n    Tue Oct 6, 9am to noon\n\n```json\n{\n  "a": 1\n}\n```\n\n> quoted\n> lines');
    expect(h).toContain('<p style="margin:0 0 1em">Hi Erin,</p>');
    expect(h).toContain('&nbsp;&nbsp;&nbsp;&nbsp;Mon Oct 5, 2pm to 5pm<br>&nbsp;&nbsp;&nbsp;&nbsp;Tue Oct 6, 9am to noon');
    expect(h).toMatch(/monospace[^>]*>\{<br>&nbsp;&nbsp;&quot;a&quot;|monospace[^>]*>\{<br>&nbsp;&nbsp;"a": 1<br>\}/);
    expect(h).toContain('<span style="color:#666">&gt; quoted</span><br><span style="color:#666">&gt; lines</span>');
    expect(h).not.toContain('pre-wrap');
    expect(html('**By hand:** reply')).toContain('<b>By hand:</b> reply');
    expect(html('x')).toMatch(/^<div style="[^"]*max-width:640px"><p /); // the style attribute closes where it should: no double quote inside it
  });
  it('every template, rendered, becomes one <p> or code block per paragraph and one <br> per inner line; never a CSS whitespace rule', () => {
    const pack = readFileSync('src/mail/mail.txt', 'utf8'), parts = pack.split(/^### (\S+)\r?\n/m).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i] === 'vision') continue; // a prompt, not a mail
      const text = C.unwrap(parts[i + 1].replace(/\{\{\w+\}\}/g, 'x')).trim();
      const blocks: string[] = []; let fence = false, cur: string[] = [];
      for (const l of text.split('\n')) { if (l.startsWith('```')) fence = !fence; if (!fence && l.trim() === '') { if (cur.length) blocks.push(cur.join('\n')); cur = []; } else cur.push(l); }
      if (cur.length) blocks.push(cur.join('\n'));
      const h = html(text);
      const paragraphs = (h.match(/<p /g) ?? []).length + (h.match(/<div style="font-family:ui-monospace/g) ?? []).length;
      const fences = blocks.filter(b => b.startsWith('```')).length;
      const inner = blocks.reduce((n, b) => n + b.split('\n').length - 1 - (b.startsWith('```') ? 2 : 0), 0);
      expect({ tpl: parts[i], paragraphs }).toEqual({ tpl: parts[i], paragraphs: blocks.length });
      expect({ tpl: parts[i], br: (h.match(/<br>/g) ?? []).length }).toEqual({ tpl: parts[i], br: inner });
      expect(h).not.toMatch(/white-space/);
      void fences;
    }
  });
  it('unwraps prose paragraphs and leaves indented, quoted, fenced, table and list lines alone', () => {
    const wrapped = 'The invite is attached. If your mail shows a file instead of\nan invite, use one of these:\n\n    Google: x\n    Outlook: y\n\n1. Give this to your agent. If it only\n   drafts, you hit send.\n2. Then wait.\n\n```json\n{\n  "a": 1\n}\n```\n\n> quoted\n> lines\n\nEnd.';
    expect(C.unwrap(wrapped)).toBe('The invite is attached. If your mail shows a file instead of an invite, use one of these:\n\n    Google: x\n    Outlook: y\n\n1. Give this to your agent. If it only drafts, you hit send.\n2. Then wait.\n\n```json\n{\n  "a": 1\n}\n```\n\n> quoted\n> lines\n\nEnd.');
    expect(C.unwrap('a\nb')).toBe('a b');
  });
  it('names', () => {
    expect(C.firstName('Doe, Jane', 'j@example.org')).toBe('Jane');
    expect(C.firstName('Sam Lee', 's@example.org')).toBe('Sam');
    expect(C.firstName(undefined, 'chris.pine@example.org')).toBe('Chris');
    expect(C.firstName(undefined, 'mark+erin@example.org')).toBe('Erin');
    expect(C.firstName('Dr. Erin Hale', 'e@example.org')).toBe('Erin');
    expect(C.firstName(undefined, 'ehale@example.org')).toBe('Ehale');
    expect(C.listTimes([[L(9, 22, 14), L(9, 22, 17)]], Z)).toBe('Tue Sep 22 2pm–5pm');
  });
  it('dates and times for humans', () => {
    expect(C.fmtSlot([L(9, 22, 14), L(9, 22, 14, 30)], M)).toBe('Tuesday, September 22, 2:00 PM to 2:30 PM Mountain');
    expect(C.fmtHours(M)).toBe('9am to 5pm');
    expect(C.fmtDay(L(9, 22, 12), Z)).toBe('Tue Sep 22');
    expect(C.fmtYmd('2026-10-02', Z)).toBe('Oct 2');
    expect(C.table([{ first: 'Erin', free: [[L(9, 22, 14), L(9, 22, 17)]] }, { first: 'Zed' }, { first: 'Chris', free: [] }], Z)).toBe('Erin: Tue Sep 22 2pm–5pm\nZed: no reply yet\nChris: none');
  });
  it('the .ics carries every required property, the organiser as ORGANIZER with the Scheduler as SENT-BY, quoted CN, CRLF, folded at 75 octets', () => {
    const tpl = readFileSync('src/mail/invite.ics', 'utf8');
    const out = C.ics(tpl, { prodid: 'p', uid: 'abc@x.org', dtstamp: C.stamp(L(9, 16, 12)), dtstart: C.stamp(L(9, 22, 14)), dtend: C.stamp(L(9, 22, 14, 30)), sequence: 1, summary: C.icsText('Intro, part 1; two'), location: 'Zoom', organiser_cn: C.param('Ridge, Sam'), organiser_address: 'mark@x.org', sent_by: C.param('mailto:meet+abc@x.org'), attendees: `ATTENDEE;CN=${C.param('Élodie Ångström-Lindqvist-Müller "the Third"')};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:someone@example.org` });
    const unfolded = out.replace(/\r\n /g, '');
    for (const k of ['VERSION:2.0', 'PRODID:p', 'METHOD:REQUEST', 'UID:abc@x.org', 'DTSTAMP:20260916T180000Z', 'DTSTART:20260922T200000Z', 'DTEND:20260922T203000Z', 'SEQUENCE:1', 'SUMMARY:Intro\\, part 1\\; two', 'LOCATION:Zoom', 'STATUS:CONFIRMED', 'ORGANIZER;CN="Ridge, Sam";SENT-BY="mailto:meet+abc@x.org":mailto:mark@x.org']) expect(unfolded).toContain(k);
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
    for (const l of out.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(out.replace(/\r\n /g, '')).toContain('ATTENDEE;CN="Élodie Ångström-Lindqvist-Müller the Third";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:someone@example.org');
  });
  it('both links are well-formed and the HTML part links them', () => {
    const { google_link, outlook_link } = C.links(D, M, [L(9, 22, 14), L(9, 22, 14, 30)]);
    expect(new URL(google_link).searchParams.get('dates')).toBe('20260922T200000Z/20260922T203000Z');
    expect(new URL(outlook_link).searchParams.get('startdt')).toBe('2026-09-22T20:00:00.000Z');
    expect(new URL(google_link).searchParams.get('text')).toBe('Introductions');
    expect(html(`see ${google_link} now`)).toContain(`<a href="${google_link.replace(/&/g, '&amp;')}">`);
  });
  it('templates and html escaping', () => {
    expect(C.render('Hi {{first}}, {{n}} in', { first: 'Zed', n: 2 })).toBe('Hi Zed, 2 in');
    expect(html('a < b')).toContain('a &lt; b');
  });
  it('the copy doc carries every template section verbatim', () => {
    const pack = readFileSync('src/mail/mail.txt', 'utf8'), doc = readFileSync('docs/email-templates.md', 'utf8'), parts = pack.split(/^### (\S+)\r?\n/m).slice(1);
    for (let i = 1; i < parts.length; i += 2) expect(doc).toContain(parts[i].replace(/\n$/, ''));
  });
});

describe('the screenshot reader', () => {
  it('maps each image to one call and fails soft', async () => {
    const calls: unknown[] = [], ai = { run: async (model: string, input: unknown) => { calls.push([model, input]); return { response: calls.length === 1 ? 'Tue Sep 22, 2pm to 5pm' : 'unreadable' }; } };
    expect(await readShots(ai, 'm', [{ type: 'image/png', data: 'AAAA' }, { type: 'image/png', data: 'BBBB' }], 'ask')).toBe('Tue Sep 22, 2pm to 5pm');
    expect(calls).toEqual([['m', { prompt: 'ask', image: 'AAAA', max_tokens: 1000 }], ['m', { prompt: 'ask', image: 'BBBB', max_tokens: 1000 }]]);
    expect(await readShots(undefined, 'm', [{ type: 'image/png', data: 'AAAA' }], 'ask')).toBeNull();
    expect(await readShots({ run: async () => ({}) }, 'm', [{ type: 'image/png', data: 'AAAA' }], 'ask')).toBeNull();
    await expect(readShots({ run: async () => { throw new Error('down'); } }, 'm', [{ type: 'image/png', data: 'AAAA' }], 'ask')).rejects.toThrow('down');
  });
});

describe('the page for agents', () => {
  it('carries public/agents.yaml verbatim, coloured, and the contract points at it', () => {
    const yaml = readFileSync('public/agents.yaml', 'utf8'), page = readFileSync('public/agents/index.html', 'utf8');
    const text = page.slice(page.indexOf('<pre>') + 5, page.indexOf('</pre>')).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    expect(text).toBe(yaml);
    expect(readFileSync('src/mail/mail.txt', 'utf8')).toContain('"learn_more": "{{page_url}}/agents"');
    expect(yaml).toMatch(/^how_to_reply:/m); expect(yaml).toMatch(/^do_not:/m); expect(yaml).toMatch(/^privacy:/m);
  });
});

describe('what the code must and must not contain', () => {
  const read = (f: string) => readFileSync(f, 'utf8');
  const lines = (f: string) => read(f).split('\n').length - 1;
  it.each<[string, number]>([['src/index.ts', 110], ['src/poll.ts', 270], ['src/core.ts', 360], ['src/check.ts', 40], ['src/vision.ts', 40], ['src/ledger.ts', 40], ['src/html.ts', 40]])('%s is within its size limit of %i lines', (f, cap) => expect(lines(f)).toBeLessThanOrEqual(cap));
  const src = ['src/index.ts', 'src/poll.ts', 'src/core.ts', 'src/check.ts'].map(read).join('\n');
  it.each<[string, RegExp]>([
    ['no bare fetch( call, only bindings', /(?<![\w.])fetch\(/], ['no address-like literal', /\w@\w/],
    ['no IANA zone', /America\/|Europe\//], ['no HH:MM literal', /\b\d\d:\d\d\b/], ['no domain', /\.com\b|\.org\b|\.edu\b/], ['no brand', /beargrass/i],
  ])('%s', (_, re) => expect(src).not.toMatch(re));
  it('core.ts is pure: no console, no fetch, no bindings', () => expect(read('src/core.ts')).not.toMatch(/console\.|fetch\(|env\./));
  it('the screenshot reader has no SDK, no key, and one caller', () => {
    const v = read('src/vision.ts');
    expect(v).not.toMatch(/anthropic|fetch\(|api_key|apiKey/i);
    expect(src + v).not.toMatch(/ANTHROPIC/);
    expect((read('src/poll.ts').match(/readShots\(/g) ?? []).length).toBe(1);
  });
});
