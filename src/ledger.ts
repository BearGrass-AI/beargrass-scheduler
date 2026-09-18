// ledger.ts — one Ledger per organiser address: when they started meetings. The counting rule is check.ts's
// kickoffCap; this object only remembers the timestamps. Added 2026-09-17 for hosting by invitation.
import { DurableObject } from 'cloudflare:workers';
import { kickoffCap } from './check';
import D from './defaults.json';

const MONTH = 30 * 86400000;

export class Ledger extends DurableObject {
  /** Records this kickoff and answers with a refusal reason, or '' to admit. Older than a month is forgotten. */
  async admit(now: number): Promise<string> {
    const times = ((await this.ctx.storage.get<number[]>('times')) ?? []).filter(t => now - t < MONTH);
    const reason = kickoffCap(times, now, D);
    if (!reason) await this.ctx.storage.put('times', [...times, now]);
    return reason;
  }
}
