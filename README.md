# meet@beargrass.ai

**Add one address on the CC, and everyone gets an invite.**

Four calendars that can't see each other. One email. One invite. The organizer writes the email they were
going to write anyway, to the people they want to meet, and copies `meet@beargrass.ai`. Each person gets a
private note; their AI assistant reads their own calendar and drafts when they're free, and they say yes.
When the last one is in, one calendar invite lands on every calendar, from the organizer, for the earliest
time that works for all of them.

No account. No software. No calendar access. Never reads a calendar, never emails anyone who wasn't on the
original email, never sells what you send. Kept for a month, then forgotten.

Reviewing this with an assistant? Start it at `AGENTS.md`; every claim there comes with the command that checks it.

This repository is the whole thing: one Cloudflare Worker, MIT licensed. The hosted address is free for
Montana's state, universities, community colleges and economic development organizations, by invitation:
[beargrass.ai](https://beargrass.ai). Anyone can run their own on their own domain in six steps, below.

## What it does, exactly

- **Who is asked:** the people on the organizer's To line. CC is ignored except the Scheduler itself; the
  organizer's receipt says who was left out.
- **Who can start one:** an email whose From is on an invited domain, authenticated by the platform for
  exactly that domain. The envelope sender alone is never trusted. One organizer may start 10 meetings a day,
  40 a month.
- **How people answer:** by handing the email to their assistant (the email ends with a JSON contract written
  for it, and [/agents](https://beargrass.ai/agents) is the long form), by typing free times one per line, or
  by replying with a screenshot of their calendar. Every direct reply is answered. A second reply merges with
  the first and the whole list is echoed back. "none" is recorded, the organizer is told, and the poll stays
  open. A reply from an address that matches nobody is reported to the organizer once and never written to.
- **The invite is the organizer's.** ORGANIZER is their address, SENT-BY the Scheduler's, so accepts reach their
  calendar and moving or cancelling it there updates everyone. Add-to-calendar links ride along for any mail
  client that shows the attachment as a file.
- **Silence:** one nudge after 48 hours with a status to the organizer; a report when the window passes with
  no invite; the record expires 30 days after the window.
- **Nothing is hard-coded.** Every name, domain, zone, hour and limit reaches the code through `wrangler.jsonc`
  or `src/defaults.json`; a test greps the source for literals. Every message it sends is one section of
  `src/mail/mail.txt`; edit the words freely.

## Run your own

You need a Cloudflare account, a domain on it that carries no other mail, and Node.

1. `npm install`, then `npx wrangler login`.
2. In `wrangler.jsonc`: `DOMAIN` (your mail domain), `MAILBOX` (the local part; `meet`), `PRODID`, `PAGE_URL`
   (where your pages are served; the ask points agents at `<PAGE_URL>/agents`), and at the top level
   `REDIRECT_ALL_TO`, the one inbox a development deploy may mail (the send binding's
   `allowed_destination_addresses` must name the same address).
3. In `src/defaults.json`: `organiser_domains` (who may start a meeting), `bot_name`, the default zone and
   hours, the limits. In `src/mail/mail.txt`: the words, keeping the `### name` headers and the
   `{{placeholders}}` you want.
4. `npm test`, then `npx wrangler deploy`: the redirected environment, which can only mail you. The Worker now
   exists for the next step to point at.
5. `npx wrangler email sending enable <domain>` and add the DNS it prints. Enable Email Routing on the domain,
   switch subaddressing on, and add one rule: `<MAILBOX>@<domain>` to the Worker you just deployed. Publish DMARC
   at `p=reject`. Send yourself one email with the address copied and the four lines; read the receipt and the ask.
6. `npx wrangler deploy --env production` once a walk with your own addresses has passed, and move the routing
   rule to the production Worker. Optional: the screenshot reader runs on Workers AI through the `AI` binding;
   remove the binding to switch it off and the copy stops offering it. `public/` is a plain page a fork can serve
   at its own host, or point `PAGE_URL` at a site of your own. `deploy/RUNBOOK.md` is the long form.

## Layout

```
src/index.ts         the email() handler: parse, guard, identify, route; a 404-only fetch
src/poll.ts          the Poll durable object, one per meeting: kickoff, replies, the invite, the alarm, every send
src/ledger.ts        the Ledger durable object, one per organizer: how many meetings they started
src/core.ts          pure logic: the reply grammar, zone math, the earliest slot, the .ics, links, rendering
src/check.ts         the gates: invited domain, authentication, the organizer's cap, the slot checks before an invite
src/vision.ts        the screenshot reader on Workers AI through the AI binding; off without the binding
src/mail/mail.txt    every outbound message and the screenshot prompt, one `### name` section each
src/mail/invite.ics  the iTIP REQUEST template
src/defaults.json    length, hours, days, zone map, limits, link shapes, invited domains, the model, the name
public/              a plain page for people, agents.yaml and /agents for assistants, 404.html, the favicon
test/core.test.ts    vitest over core, check and vision; the copy doc; the greps (no fetch, no literals); size limits
test/walkthrough.sh  injects a kickoff, replies, must-drop and must-echo messages and a "none" poll; asserts every stage
test/doc.mjs         writes docs/email-templates.md from mail.txt
test/agents.mjs      writes public/agents/index.html from public/agents.yaml; a test proves them equal
test/fixtures/       the kickoff the walkthrough starts from; clients/ holds real messages from real mail clients
docs/                email-templates.md (generated), user-guide.md, for-your-mail-admin.md
deploy/              RUNBOOK.md, setup.sh
wrangler.jsonc       the two environments: the redirected one at the top level; production under env
```

Each source file has a size limit enforced by a test (handler 110 lines, poll 270, core 360, check 40,
vision 40, ledger 40). When a file reaches its limit it is refactored, not raised.

## Commands

```bash
npm install
npm run types        # regenerates worker-configuration.d.ts (gitignored)
npm test             # vitest
node test/doc.mjs    # regenerate the copy doc after editing mail.txt
node test/agents.mjs # regenerate the agents page after editing public/agents.yaml
npx wrangler dev --port 8797 --persist-to "$(mktemp -d)" > /tmp/scheduler-dev.log 2>&1 &   # fresh state each session
sh test/walkthrough.sh 8797 /tmp/scheduler-dev.log   # exits 1 on the first stage whose send count is wrong
```

## The injected walkthrough

Local dev cannot receive real mail. Inbound messages are injected at the dev server's local email URL;
outbound sends are logged by the simulator and written to files, never delivered. Every send is addressed to
the redirect inbox. The participants are the maintainer's own test addresses.

```
1  kickoff inside an existing thread, three on To, a note-taker on CC (CC is not asked; the receipt says who was left out);
   the ask quotes the organizer's own words and not the thread below them
3a an assistant: two epoch ranges and one human line (envelope on the primary, header on an alias, as Gmail sends)
3b anytime, above an Outlook quote
3c a real Apple Mail message, body quoted with "> " (fixture replay)
3t "Thanks!" answered: couldn't use any times, here's what I saw; earlier times kept
3m one more line: the whole list echoed back (merge and echo)
3g a German Outlook reply (Von:/Gesendet:, no quote marks) quoting the ask's own example lines: only the real line read
3u a stranger writes to the poll address, twice: one note to the organizer
3d the organizer answers by Reply-All: receipt + the invite (reply-all note, epoch line and invite.ics asserted)
X1 organizer chatter after the invite: silent   X3 out-of-office: dropped   X0 forged kickoff: dropped
X4 a late reply after the invite: the already-set receipt   X5 the same reply delivered twice: read once
5  second poll: "none" (HTML-only), then a correction, then the invite for the earliest half hour inside both
6  a kickoff-shaped Reply-All on the finished thread opens a new poll with the new dates
PASS: 26 sends where 26 were expected, every stage asserted on count and text.
```

Measured on real mail: outbound passes DKIM, SPF and DMARC at Google; subaddressed replies reach the Worker;
Gmail send-as keeps the envelope as the primary (handled); Apple Mail quotes a scripted body (handled, and
replayed above from the real message); a reply line identical to an ask example is the person's own
(handled); a kickoff sent as a reply quotes only the organizer's words (handled).

## Not built, by name

Reading the organizer's "widen a week" / "go without <name>" replies; recognizing a participant who replies
from an address on another domain than the one on the kickoff (the organizer is told instead); a one-email
mode where the organizer sets Reply-To to the Scheduler and pastes the agent contract themselves.

## Security

See `SECURITY.md`. Report to `meet-abuse@beargrass.ai`.
