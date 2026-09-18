# beargrass-scheduler

**One CC schedules a meeting between people whose calendars cannot see each other.**

An organiser writes the email they were going to write anyway, puts the people on To and `meet@beargrass.ai`
on CC, and adds four lines: how long, between which dates, which hours, where. One Cloudflare Worker then
emails each person privately for their free times, reads the replies (typed by a human, drafted by their
assistant as epoch ranges, or read from a calendar screenshot), and when the last one is in sends everyone a
single calendar invite for the earliest common slot: an `.ics` on the organiser's behalf plus add-to-calendar
links. It never reads a calendar, never emails anyone who was not on the original email, and holds no secrets.

Hosted at `scheduler.beargrass.ai` for invited organisations. MIT licensed: run your own on your own domain.

## How it behaves

- **Who is asked:** the people on the organiser's To line. CC is ignored except the Scheduler itself; the
  organiser's receipt says who was left out.
- **Who can start one:** an email whose From is on an invited domain (`organiser_domains`; a listed domain
  admits its subdomains) and whose DKIM or DMARC result at the receiving platform aligns with exactly that
  domain. The envelope sender alone is never trusted. One organiser may start 10 meetings a day, 40 a month.
- **Every direct reply is answered.** A reply from an address that matches nobody is reported to the organiser
  once and never written to. "none" is recorded, the organiser is told, and the poll stays open. A second reply
  merges with the first and the whole list is echoed back.
- **The invite is the organiser's.** ORGANIZER is their address, SENT-BY the Scheduler's, so accepts reach
  their calendar and moving or cancelling it there updates everyone.
- **Times are read in the meeting's zone** unless a line names one. Agents send epoch seconds as `START-END`.
- **Silence:** one nudge after 48 hours, with a status to the organiser; a report when the window passes with
  no invite; the record expires 30 days after the window.
- **Nothing is hard-coded.** Every name, domain, zone, hour and limit reaches the code through `wrangler.jsonc`
  (layer 0) or `src/defaults.json` (layer 1); a test greps the source for literals.

## Run your own

You need a Cloudflare account, a domain on it that carries no other mail, and Node.

1. `npm install`, then `npx wrangler login`.
2. In `wrangler.jsonc`: set `DOMAIN` (your mail domain), `MAILBOX` (the local part; `meet`), `PRODID`, `PAGE_URL` (where your pages are served; the ask points agents at `<PAGE_URL>/agents`), and at the
   top level `REDIRECT_ALL_TO` (the one inbox a development deploy may mail; the send binding's
   `allowed_destination_addresses` must name the same address). Under `env.production`, add a custom-domain route if you want this Worker to serve `public/` as your page; otherwise serve the pages elsewhere and point `PAGE_URL` there.
3. In `src/defaults.json`: `organiser_domains` (who may start a meeting), `scheduler_name`, the default zone and
   hours, the limits. `src/mail/mail.txt` is every message the Scheduler sends; edit the words freely, keep the
   `### name` headers and the `{{placeholders}}` you want.
4. `npx wrangler email sending enable <domain>` and add the DNS it prints. Enable Email Routing on the domain,
   switch subaddressing on, and add one rule: `<MAILBOX>@<domain>` → this Worker. Publish DMARC at `p=reject`.
5. `npm test`, then `npx wrangler deploy` for the redirected environment (mails only you), and
   `npx wrangler deploy --env production` when a walk with your own addresses has passed.
6. Optional: the screenshot reader runs on Workers AI through the `AI` binding. Remove the binding to switch it
   off; the copy stops offering it. `deploy/RUNBOOK.md` has the long form.

## Layout

```
src/index.ts         the email() handler: parse, guard, identify, route; a 404-only fetch
src/poll.ts          the Poll durable object, one per meeting: kickoff, replies, the invite, the alarm, every send
src/ledger.ts        the Ledger durable object, one per organiser: how many meetings they started
src/core.ts          pure logic: the reply grammar, zone math, the earliest slot, the .ics, links, rendering
src/check.ts         the gates: invited domain, authentication, the organiser's cap, the slot checks before an invite
src/vision.ts        the screenshot reader on Workers AI through the AI binding; off without the binding
src/mail/mail.txt    every outbound message and the screenshot prompt, one `### name` section each
src/mail/invite.ics  the iTIP REQUEST template
src/defaults.json    layer 1: length, hours, days, zone map, limits, link shapes, invited domains, the model
public/              index.html (the page and the picker), agents.yaml + agents/ (the page for agents), 404.html, the wordmark, the favicon
test/core.test.ts    vitest over core, check and vision, the copy doc, the greps (no fetch, no literals) and the ceilings
test/walkthrough.sh  injects a kickoff, replies, must-drop and must-echo messages and a "none" poll; asserts every stage
test/doc.mjs         writes docs/email-templates.md from mail.txt
test/agents.mjs      writes public/agents/index.html from public/agents.yaml, coloured; a test proves them equal
test/fixtures/       the kickoff the walkthrough starts from; clients/ holds real messages from real mail clients
docs/                flat: email-templates.md (generated), user-guide.md, for-your-mail-admin.md
deploy/              RUNBOOK.md, setup.sh
wrangler.jsonc       layer 0. Top level = the redirected environment; production = --env production
```

Ceilings per file, enforced by a test: handler 110, poll 270, core 360, check 40, vision 40, ledger 40. When a
file reaches its ceiling it is refactored, not raised.

## Commands

```bash
npm install
npm run types        # regenerates worker-configuration.d.ts (gitignored)
npm test             # vitest
node test/doc.mjs    # regenerate the copy doc after editing mail.txt
node test/agents.mjs # regenerate the agents page after editing public/agents.yaml
npx wrangler dev --port 8797 --persist-to "$(mktemp -d)" > /tmp/beargrass-scheduler-dev.log 2>&1 &   # fresh state: the ledger counts kickoffs per organiser
sh test/walkthrough.sh 8797 /tmp/beargrass-scheduler-dev.log   # exits 1 on the first stage whose send count is wrong
```

## The injected walkthrough, read 2026-09-18 22:46 MDT

Local dev cannot receive real mail. Inbound messages are injected at the dev server's local email URL;
outbound sends are logged by the simulator and written to files, never delivered. Every send in the log was
addressed to the redirect inbox: the top-level environment rewrites recipients in code and the send binding
itself is restricted to that address. The participants are the operator's own plus-addresses.

```
1  kickoff inside an existing thread, three on To, a note-taker on CC (CC is not asked; the receipt says who was left out);
   the ask quotes the organiser's own words and not the thread below them
3a Erin's assistant: two epoch ranges and one human line (envelope mark@, header mark+erin@, as Gmail sends)
3b Chris: anytime, above an Outlook quote
3c Zed: a real Apple Mail message, body quoted with "> " (fixture replay) → "2 free times"
3t Erin writes "Thanks!" → answered: couldn't use any times, here's what I saw; her times kept
3m Erin adds one more line → "4 free times", the whole list echoed back (merge and echo)
3g a German Outlook reply (Von:/Gesendet:, no quote marks) quoting the ask's own example lines → only Chris's real line read
3u a stranger writes to the poll address, twice → one note to the organiser
3d Mark answers on the thread by Reply-All (In-Reply-To unknown; References = root, kickoff, unknown) → receipt + the invite
   (reply-all note, epoch line and invite.ics asserted)
X1 organiser chatter after the invite: silent   X3 out-of-office: dropped   X0 forged kickoff: dropped
X4 a late reply after the invite → the already-set receipt   X5 the same reply delivered twice → read once
5  second poll: Erin says none (HTML-only) → her receipt + the organiser's note; Erin corrects → receipt;
   Mark answers → receipt + the invite for the earliest half hour inside both
6  a kickoff-shaped Reply-All on the finished thread opens a new poll with the new dates
PASS: 26 sends where 26 were expected, every stage asserted on count and text.
```

The first poll's invite chose **Thursday, September 24, 10:30 to 11:00 AM Mountain**, the earliest half hour inside
all four replies. The attachment as sent, unfolded here (on the wire it is CRLF, folded at 75 octets):

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BeargrassAI//Beargrass Scheduler//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:4hrlrkiixqjl@beargrass.ai
DTSTAMP:20260917T031855Z
DTSTART:20260924T163000Z
DTEND:20260924T170000Z
SEQUENCE:1
SUMMARY:Introductions
LOCATION:Google Meet
STATUS:CONFIRMED
ORGANIZER;CN="Mark Ulett";SENT-BY="mailto:meet+4hrlrkiixqjl@beargrass.ai":mailto:mark@beargrassai.com
ATTENDEE;CN="Mark Ulett";ROLE=CHAIR;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:mark@beargrassai.com
ATTENDEE;CN="Erin Hale";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:mark+erin@beargrassai.com
ATTENDEE;CN="Pine, Chris";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:mark+chris@beargrassai.com
ATTENDEE;CN="River, Zed";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:mark+zed@beargrassai.com
END:VEVENT
END:VCALENDAR
```

Measured on real mail, 2026-09-17: outbound passes DKIM, SPF and DMARC at Google; subaddressed replies reach
the Worker; Gmail send-as keeps the envelope as the primary (handled); Apple Mail quotes a scripted body
(handled, and replayed above from the real message); four real mailboxes produced a correct invite with the
organiser as ORGANIZER; a reply line identical to an ask example is the person's own (handled). Not yet
measured: Outlook's rendering of the attachment; the screenshot reader's quality on real calendars.

## Not built, by name

Reading the organiser's "widen a week" / "go without <name>" replies; recognising a participant who replies
from an address on another domain than the one on the kickoff (the organiser is told instead); a one-email
mode where the organiser sets Reply-To to the Scheduler and pastes the agent contract themselves.
