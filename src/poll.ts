// poll.ts — one Durable Object per meeting. Holds the state, answers every reply, sends every email.
// Rewritten for a human reader 2026-09-17 under four rules: To is the list; every direct reply is answered; strangers are reported once; "none" keeps the poll open.
import { DurableObject } from 'cloudflare:workers';
import * as C from './core';
import { sanity } from './check';
import { readShots, type Shot, type Vision } from './vision';
import type { Ledger } from './ledger';
import D from './defaults.json';
import inviteIcs from './mail/invite.ics';
import pack from './mail/mail.txt';

/** The template pack: `### name` headers, bodies verbatim. */
const T: Record<string, string> = Object.fromEntries(pack.split(/^### (\S+)\r?\n/m).slice(1).reduce<[string, string][]>((acc, x, i, arr) => (i % 2 ? acc : [...acc, [x, arr[i + 1]]]), []));

export type Env = { EMAIL: SendEmail; POLL: DurableObjectNamespace<Poll>; LEDGER: DurableObjectNamespace<Ledger>; ASSETS: Fetcher; AI?: Ai; DOMAIN: string; MAILBOX: string; PRODID: string; AUTHSERV: string; PAGE_URL: string; REDIRECT_ALL_TO?: string };
export type Person = { address: string; name: string; first: string };
export type Kick = { id: string; msgId: string; organiser: Person; people: Person[]; ignored: string[]; subject: string; text: string; now: number; refused: string }; // refused: the organiser's cap, from the ledger; '' admits
export type Sub = { from: string; msgId: string; text: string; others: string[]; viaThread: boolean; shots: Shot[] }; // others: every other To/CC address, for the reply-all note
type State = {
  id: string; msgId: string; meeting: C.Meeting; organiser: Person; people: Person[]; quote: string; created: number; version: number;
  subs: Record<string, C.Iv[]>;      // each participant's free set; an empty array is a recorded "none"
  unknown: string[];                 // addresses that wrote to this poll and matched nobody; the organiser is told once each
  seenIds: string[];                 // message ids already handled; a reply delivered to two of our addresses is read once
  nudged: boolean; noneNoted: string[]; reported: boolean; // the nudge round ran; whose "none" the organiser has heard about; the final no-overlap report went
  sent?: C.Iv;                       // the frozen slot once the invite has gone
  closed?: string;                   // set when the window passed or the poll expired without an invite; the reason, for the receipt
};
const HOUR = 3_600_000, DAY = 86_400_000;

/** One structured line per decision. The live tail is the only window into production; bodies are never logged. */
/** The organiser's own words: the kickoff cut at the first history line, quote marks stripped, blank lines kept. (2026-09-17: a reply on a long thread would have quoted the whole thread to everyone.) */
const ownWords = (text: string) => {
  const lines = text.split(/\r?\n/).map(l => l.replace(/^(>\s?)+/, '').trimEnd());
  const n = lines.findIndex((l, i) => C.isAttribution(l.trim(), (lines[i + 1] ?? '').trim()) || C.isSeparator(l.trim()));
  return (n < 0 ? lines : lines.slice(0, n)).join('\n').trim();
};
const log = (poll: string, event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ poll, event, ...extra }));

export class Poll extends DurableObject<Env> {
  st?: State;
  async load() { return (this.st ??= await this.ctx.storage.get<State>('st')); }
  async save() { await this.ctx.storage.put('st', this.st!); }

  // ---- kickoff: the organiser's email, CC'd to the Scheduler
  async kickoff(k: Kick) {
    if (await this.load()) { log(k.id, 'kickoff.duplicate'); return; }
    const meeting = C.parseKickoff(k.text, k.subject, D, k.now);
    const days = (Date.parse(meeting.end) - Date.parse(meeting.start)) / DAY + 1;
    this.st = { id: k.id, msgId: k.msgId, meeting, organiser: k.organiser, people: k.people, quote: ownWords(k.text).slice(0, D.max_quote_chars), created: k.now, version: 0, subs: {}, unknown: [], seenIds: [], nudged: false, noneNoted: [], reported: false };
    const reason =
      k.refused ? k.refused :
      k.people.length > D.max_participants ? `${k.people.length} people is more than ${D.max_participants}` :
      k.people.length < 2 ? 'nobody else is on the To line' :
      days < 1 ? 'the end date is before the start date' :
      days > D.max_window_days ? `${days} days is longer than ${D.max_window_days}` :
      Date.parse(meeting.end) + DAY < k.now ? 'those dates are already past' : '';
    if (reason) {
      log(k.id, 'kickoff.refused', { reason, people: k.people.length });
      await this.mail([k.organiser], 'refused', { reason, seen_list: this.seenList(k) }).catch(() => {});
      this.st = undefined;
      return;
    }
    await this.save();
    await this.ctx.storage.setAlarm(k.now + D.nudge_after_hours * HOUR); // set before any send: a failed send must not strand the poll
    log(k.id, 'kickoff.created', { people: k.people.length, ignored: k.ignored.length, window: [meeting.start, meeting.end] });
    await this.mail([k.organiser], 'kickoff-receipt', { others: this.others(k.organiser), seen_list: this.seenList(k) }).catch(() => {});
    for (const p of k.people) await this.mail([p], 'ask', { first: p.first, others: this.others(p) }).catch(() => {});
  }

  // ---- a reply. Serialised per poll so two replies cannot both trigger the invite.
  submit(s: Sub) { return this.ctx.blockConcurrencyWhile(() => this.handle(s)); }

  private async handle(s: Sub) {
    const st = await this.load();
    if (!st) { log('?', 'submit.no-poll', { from: s.from }); return; }
    const who = st.people.find(p => p.address === s.from);
    if (!who) return this.unknownSender(s);
    if (st.seenIds.includes(s.msgId)) { log(st.id, 'submit.duplicate', { from: who.first }); return; } // the same reply delivered to two of our addresses
    st.seenIds = [...st.seenIds.slice(-99), s.msgId];
    const reading = await this.read(s, who);
    const readable = reading.free.length > 0 || reading.none;
    const replyAll = s.others.some(a => st.people.some(p => p.address === a)); // only when another participant saw it, not an assistant on CC
    log(st.id, 'submit', { from: who.first, path: s.viaThread ? 'thread' : 'direct', lines: reading.seen.length, free: reading.free.length, unread: reading.unread.length, dropped: reading.dropped.length, none: reading.none, shots: s.shots.length, sent: !!st.sent, closed: !!st.closed });

    // Rule 2: thread chatter without times stays silent; a direct reply is always answered.
    if (s.viaThread && !readable) return;
    if (st.sent) return this.mail([who], 'already-set', { first: who.first, slot_human: C.fmtSlot(st.sent, st.meeting) });
    if (st.closed) return this.mail([who], 'closed', { first: who.first, reason: st.closed });

    if (reading.none) {
      st.subs[s.from] = [];
      await this.save();
      await this.mail([who], 'none-receipt', { first: who.first });
      if (!st.noneNoted.includes(s.from)) { st.noneNoted.push(s.from); await this.save(); await this.report('none-noted', { first: who.first }); }
      return this.finishOrRetry();
    }
    if (!readable) {
      const tpl = reading.seen.length ? 'unread-all' : 'nothing-here';
      return this.mail([who], tpl, { first: who.first, seen_lines: reading.seen.join('\n    '), dropped_block: this.droppedBlock(reading) });
    }
    // Rule (2026-09-17): a second list merges into the first, and the receipt echoes the whole list so they can see it.
    st.subs[s.from] = C.clip([...(st.subs[s.from] ?? []), ...reading.free], st.meeting);
    await this.save();
    const z = st.meeting.zone, all = st.subs[s.from];
    const inserts = {
      read_block: reading.fromShot ? C.render(T['read-block'], { lines: reading.fromShot }) : '',
      unread_block: reading.unread.length ? C.render(T['unread-block'], { ...this.vars(), unread_lines: reading.unread.join('\n    ') }) : '',
      dropped_block: this.droppedBlock(reading),
      replyall_line: replyAll ? T['replyall-line'] : '',
      your_times: C.listTimes(all, z), zone_name: st.meeting.zoneName,
    };
    await this.mail([who], 'receipt', { first: who.first, n_times: all.length, first_date: C.fmtDate(all[0][0], z), last_date: C.fmtDate(all[all.length - 1][1], z), ...inserts });
    return this.finishOrRetry();
  }

  private droppedBlock(r: C.Reading) { return r.dropped.length ? C.render(T['dropped-block'], { dropped_lines: r.dropped.join('\n    ') }) : ''; }

  /** finish(), and if the invite send failed, come back within the hour rather than at the next scheduled alarm. */
  private async finishOrRetry() {
    const ok = await this.finish().then(() => true, err => { log(this.st!.id, 'finish.failed', { error: String(err) }); return false; });
    if (!ok) await this.ctx.storage.setAlarm(Date.now() + D.retry_hours * HOUR);
  }

  /** Text first; if nothing readable and a screenshot came with it, the model reads the screenshot. */
  private async read(s: Sub, who: Person): Promise<C.Reading & { fromShot?: string }> {
    const st = this.st!, v = this.vars();
    const own = [`${v.ex1}, 2pm to 5pm`, `${v.ex2}, 9am to noon`, `${v.ex3}, all day`, String(v.ex_epoch)]; // the ask's own examples are never the person's times
    const text = C.parseReply(s.text, st.meeting, D.max_lines, own);
    if (text.free.length || text.none || !s.shots.length) return text;
    const ask = C.render(T.vision, { ...v, first: who.first });
    const lines = await readShots(this.env.AI as unknown as Vision | undefined, D.vision_model, s.shots, ask).catch(err => { log(st.id, 'vision.failed', { error: String(err) }); return null; });
    if (!lines) return text;
    const shot = C.parseReply(lines, st.meeting, D.max_lines, own);
    if (shot.none) return { ...text, unread: [...text.unread, lines.trim()] }; // a model saying "none" is an unread screenshot, not a person's none
    return { ...shot, fromShot: lines.trim().split('\n').join('\n    ') };
  }

  /** Someone wrote to this poll's address and matched nobody. The organiser hears about each address once. */
  private async unknownSender(s: Sub) {
    const st = this.st!;
    log(st.id, 'submit.unknown', { from: s.from, path: s.viaThread ? 'thread' : 'direct' });
    if (s.viaThread || st.unknown.includes(s.from)) return;
    st.unknown.push(s.from);
    await this.save();
    await this.report('unknown-sender', { address: s.from });
  }

  /** Everyone in → compute → gate → send the invite → freeze only after the send succeeded. */
  private async finish() {
    const st = this.st!;
    if (st.sent || Object.keys(st.subs).length < st.people.length) return;
    const subs = st.people.map(p => st.subs[p.address]);
    const slot = C.earliest(subs, st.meeting, Date.now());
    if (!slot) {
      log(st.id, 'finish.no-overlap', { reported: st.reported });
      if (st.reported) return; // the organiser has the table; the poll stays open for corrections
      st.reported = true;
      await this.save();
      return this.report('no-overlap');
    }
    const bad = sanity(slot, st.meeting, subs, Date.now());
    if (bad.length) {
      log(st.id, 'finish.gate-failed', { reasons: bad });
      if (st.reported) return;
      st.reported = true;
      await this.save();
      return this.report('unsure', { slot_human: C.fmtSlot(slot, st.meeting), reasons: bad.join('; ') });
    }
    const m = st.meeting;
    const attendees = st.people.map(p => p.address === st.organiser.address
      ? `ATTENDEE;CN=${C.param(p.name)};ROLE=CHAIR;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${C.addr(p.address)}` // the organiser is not asked to accept their own meeting
      : `ATTENDEE;CN=${C.param(p.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${C.addr(p.address)}`).join('\n');
    const content = C.ics(inviteIcs, { prodid: this.env.PRODID, uid: `${st.id}@${this.env.DOMAIN}`, dtstamp: C.stamp(Date.now()), dtstart: C.stamp(slot[0]), dtend: C.stamp(slot[1]), sequence: st.version + 1, summary: C.icsText(m.name), location: C.icsText(m.place), organiser_cn: C.param(st.organiser.name), organiser_address: C.addr(st.organiser.address), sent_by: C.param(`mailto:${this.address()}`), attendees }); // the organiser owns the event; the Scheduler only sent it (RFC 5545 SENT-BY): accepts reach their calendar and they can move or cancel it
    await this.mail(st.people, 'invite', { slot_human: C.fmtSlot(slot, m), epoch_start: Math.floor(slot[0] / 1000), epoch_end: Math.floor(slot[1] / 1000), ...C.links(D, m, slot) }, [{ filename: 'invite.ics', type: 'text/calendar', content, disposition: 'attachment' }]);
    st.sent = slot;
    st.version++;
    await this.save();
    log(st.id, 'invite.sent', { slot });
  }

  // ---- the alarm. Three moments: the nudge round; the end of the window; expiry. A failed invite send retries hourly between them.
  alarm() { return this.ctx.blockConcurrencyWhile(() => this.tick()); }
  private async tick() {
    const st = await this.load();
    if (!st) return;
    const now = Date.now(), bl = C.blocks(st.meeting);
    const windowEnd = (bl[bl.length - 1]?.[1] ?? st.created) + DAY; // a day after the last working block: replies on the last day still count
    const expiresAt = Math.max(st.created + D.ttl_days * DAY, windowEnd + D.window_slack_days * DAY); // never delete a poll whose window is still open
    const missing = () => st.people.filter(p => !(p.address in st.subs)).map(p => p.first).join(', ');
    if (now >= expiresAt - 60_000) {
      log(st.id, 'expired', { sent: !!st.sent, closed: !!st.closed });
      if (!st.sent && !st.closed) await this.report('window-passed', { missing: missing() || 'nobody' }).catch(() => {});
      await this.ctx.storage.deleteAll(); this.st = undefined; return;
    }
    if (!st.nudged && !st.sent && now >= st.created + D.nudge_after_hours * HOUR) {
      const silent = st.people.filter(p => !(p.address in st.subs));
      log(st.id, 'nudge', { silent: silent.length });
      for (const p of silent) await this.mail([p], 'nudge', { first: p.first }).catch(() => {});
      if (silent.length) await this.report('nudge-status', { missing: missing() }).catch(() => {});
      st.nudged = true;
      await this.save();
    }
    const ok = await this.finish().then(() => true, err => { log(st.id, 'finish.failed', { error: String(err) }); return false; });
    if (!st.sent && !st.closed && now >= windowEnd) {
      st.closed = `the window ended on ${C.fmtYmd(st.meeting.end, st.meeting.zone)}`; // late replies get told, once each, by the closed receipt
      await this.save();
      log(st.id, 'window-passed', { missing: missing() });
      await this.report('window-passed', { missing: missing() || 'nobody' }).catch(() => {});
    }
    const next = !ok ? now + D.retry_hours * HOUR : !st.nudged ? st.created + D.nudge_after_hours * HOUR : !st.closed && !st.sent ? windowEnd : expiresAt;
    await this.ctx.storage.setAlarm(Math.max(next, now + 60_000));
  }

  // ---- helpers
  private report(tpl: string, v: Record<string, unknown> = {}) {
    const st = this.st!;
    const rows = st.people.map(p => ({ first: p.first, free: st.subs[p.address] }));
    return this.mail([st.organiser], tpl, { ...v, table: C.table(rows, st.meeting.zone).replace(/\n/g, '\n    ') });
  }
  private others(p: Person) {
    const names = this.st!.people.filter(q => q !== p && q !== this.st!.organiser).map(q => q.first);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'you';
  }
  private seenList(k: Kick) {
    const asked = k.people.map(p => `${p.first} <${p.address}>`).join(', ');
    return k.ignored.length ? `${asked}. On CC and therefore not asked: ${k.ignored.join(', ')}` : asked;
  }
  private address() { return `${this.env.MAILBOX}+${this.st!.id}@${this.env.DOMAIN}`; }

  /** Every placeholder a template may use. Computed per send; the poll is small. */
  private vars(): Record<string, unknown> {
    const st = this.st!, m = st.meeting, z = m.zone;
    const bl = C.blocks(m);
    const ex = bl.slice(0, 3).map(([s]) => C.fmtDay(s, z));
    const sec = (ms: number) => Math.floor(ms / 1000);
    return {
      bot: D.bot_name, page_url: this.env.PAGE_URL, organiser_first: st.organiser.first, meeting: m.name, length: m.length, place: m.place, count: st.people.length, n_in: Object.keys(st.subs).length,
      window_start: C.fmtYmd(m.start, z), window_end: C.fmtYmd(m.end, z), hours: C.fmtHours(m), zone_name: m.zoneName, zone_iana: m.zone, year: m.start.slice(0, 4),
      window_epoch: bl.length ? `${sec(bl[0][0])} to ${sec(bl[bl.length - 1][1])}` : '', ex_epoch: bl[0] ? `${sec(bl[0][0])}-${sec(bl[0][1])}` : '',
      ex1: ex[0] ?? '', ex2: ex[1] ?? ex[0] ?? '', ex3: ex[2] ?? ex[0] ?? '',
      nudge_after: D.nudge_after_hours, expires_human: C.fmtDay(st.created + D.ttl_days * DAY, z),
      scheduler_address: this.address(), quoted: st.quote.split('\n').map(l => `> ${l}`).join('\n'),
      shot_option: this.env.AI ? T['shot-option'] : '', shot_line: this.env.AI ? T['shot-line'] : '',
    };
  }

  /** Every send: a reply in the kickoff's thread, from meet+<id>@, only to people on the kickoff, deduplicated, redirected outside production. */
  private async mail(to: Person[], tpl: string, v: Record<string, unknown>, attachments?: EmailAttachment[]) {
    const st = this.st!, env = this.env, addr = this.address(), vars = this.vars();
    if (!C.subset(to.map(p => p.address), st.people.map(p => p.address))) throw new Error('recipient outside the poll');
    const text = C.unwrap(C.render(T[tpl], { ...vars, ...v }));
    const recipients = [...new Set(to.map(p => env.REDIRECT_ALL_TO ?? p.address))];
    await env.EMAIL.send({
      from: { name: C.render(D.scheduler_name, vars), email: addr }, replyTo: addr, to: recipients, subject: `Re: ${st.meeting.name}`,
      text, html: C.html(text), headers: { 'In-Reply-To': st.msgId, References: st.msgId, 'Auto-Submitted': 'auto-generated' },
      ...(attachments ? { attachments } : {}),
    });
    log(st.id, 'mail', { tpl, to: to.map(p => p.first) });
  }
}
