// index.ts — the email handler: parse, guard, identify, route. Everything about a meeting lives in poll.ts.
// Rewritten for a human reader 2026-09-17.
import PostalMime, { type Email } from 'postal-mime';
import * as C from './core';
import D from './defaults.json';
import { allowed, authenticated } from './check';
import { Poll, type Env, type Person } from './poll';
import { Ledger } from './ledger';
export { Poll, Ledger };

/** RFC 3834 auto-replies and iTIP REPLY/COUNTER parts are never read as availability. Attachments arrive base64. */
const isAuto = (m: Email) =>
  m.headers.some(h => {
    const k = h.key.toLowerCase(), v = h.value.toLowerCase();
    return (k === 'auto-submitted' && v !== 'no') || (k === 'precedence' && /bulk|auto_reply|junk/.test(v)) || k === 'x-autoreply'; // Exchange puts X-Auto-Response-Suppress on ordinary mail too; it is not a signal
  }) || m.attachments.some(a => a.mimeType === 'text/calendar' && /METHOD:(REPLY|COUNTER)/.test(atob(String(a.content))));

/** First 12 base32 characters of SHA-256: the plus tag, the object name, the UID. */
async function pollId(s: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0, value = 0, out = '';
  for (const byte of hash) {
    value = ((value << 8) | byte) >>> 0; bits += 8;
    while (bits >= 5 && out.length < 12) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out;
}

const person = (a: { name?: string; address?: string }): Person => ({ address: (a.address ?? '').toLowerCase(), name: a.name?.trim() || C.firstName(undefined, a.address ?? ''), first: C.firstName(a.name, a.address ?? '') });

/** Every message id this mail replies to: In-Reply-To first, then References newest first. */
const threadIds = (m: Email) => [m.inReplyTo ?? '', ...(m.references ?? '').split(/\s+/).reverse()].map(s => /<[^>]+>/.exec(s)?.[0]).filter((s): s is string => !!s).slice(0, 40);

export default {
  /** The only HTTP behaviour: an unknown path gets the 404 page from the static assets. The page itself never reaches the Worker. */
  fetch: (req: Request, env: Env) => env.ASSETS.fetch(new Request(new URL('/404.html', req.url))).then(r => new Response(r.body, { status: 404, headers: r.headers })),

  async email(msg: ForwardableEmailMessage, env: Env): Promise<void> {
    try {
      const mail = await PostalMime.parse(await new Response(msg.raw).arrayBuffer(), { attachmentEncoding: 'base64' });
      if (isAuto(mail)) return;
      const [box, tag] = msg.to.toLowerCase().split('@')[0].split('+');
      if (box !== env.MAILBOX) return;

      // Identity. An alias on the sender's own domain is the person (Gmail and M365 send-as keep the envelope as the
      // primary mailbox and put the alias in the From header). A header on any other domain is not trusted.
      const envelope = msg.from.toLowerCase();
      const header = (mail.from?.address ?? '').toLowerCase();
      const from = header && header.split('@')[1] === envelope.split('@')[1] ? header : envelope;

      const isScheduler = (a: string) => a.toLowerCase().split('@')[0].split('+')[0] === env.MAILBOX && a.toLowerCase().endsWith(`@${env.DOMAIN}`);
      const others = [...(mail.to ?? []), ...(mail.cc ?? [])].map(a => a.address?.toLowerCase() ?? '').filter(a => a && !isScheduler(a));
      const msgId = mail.messageId ?? msg.headers.get('message-id') ?? `${Date.now()}`;
      const text = C.textOf(mail.text, mail.html);
      const shots = mail.attachments
        .filter(a => /^image\/(png|jpe?g|gif|webp)$/.test(a.mimeType) && String(a.content).length >= D.min_shot_bytes) // signature icons are not screenshots
        .sort((a, b) => Number(a.disposition === 'inline') - Number(b.disposition === 'inline')) // attached images before inline ones
        .map(a => ({ type: a.mimeType.replace('/jpg', '/jpeg'), data: String(a.content) }));
      const sub = { from, msgId, text, others, viaThread: false, shots };

      // A tagged address is a reply to that poll.
      if (tag) return await env.POLL.get(env.POLL.idFromName(tag)).submit(sub);

      // Bare meet@ with the labeled block is a kickoff even inside an old thread ("start a fresh email and CC me again" rarely is).
      const looksLikeKickoff = /^(?:>\s?)*(Between|Length|Hours|Where):/im.test(text); // through Apple Mail's quote marks too
      if (!looksLikeKickoff) {
        for (const ref of threadIds(mail)) {
          const poll = env.POLL.get(env.POLL.idFromName(await pollId(ref)));
          if (await poll.load()) return await poll.submit({ ...sub, viaThread: true });
        }
      }
      // A kickoff is identified by its From header on an invited domain, and that header must be authenticated. The envelope never substitutes.
      const domain = header.split('@')[1] ?? '';
      const ar = mail.headers.find(h => h.key.toLowerCase() === 'authentication-results')?.value ?? '';
      if (!allowed(domain, D.organiser_domains) || !authenticated(ar, domain, env.AUTHSERV)) { console.log(JSON.stringify({ event: 'kickoff.rejected', header, envelope, ar: ar.slice(0, 300) })); return; }

      // Rule (2026-09-17): the people on To are the participants; CC is ignored except the Scheduler itself.
      const id = await pollId(msgId);
      const organiser = person({ name: mail.from?.name, address: header });
      const people = [organiser];
      for (const a of mail.to ?? []) if (a.address && !isScheduler(a.address) && !people.some(p => p.address === a.address!.toLowerCase())) people.push(person(a));
      const ignored = (mail.cc ?? []).map(a => a.address?.toLowerCase() ?? '').filter(a => a && !isScheduler(a) && !people.some(p => p.address === a));
      const refused = await env.LEDGER.get(env.LEDGER.idFromName(organiser.address.replace(/\+[^@]*@/, '@'))).admit(Date.now()); // too many meetings from one organiser; a plus-tag is the same mailbox
      await env.POLL.get(env.POLL.idFromName(id)).kickoff({ id, msgId, organiser, people, ignored, subject: mail.subject ?? '', text, now: Date.now(), refused });
    } catch (err) {
      console.log(JSON.stringify({ event: 'email.failed', error: String(err) })); // a failure here is ours; never bounce it back to a human
    }
  },
};
