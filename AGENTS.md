# For the assistant reviewing this repository

You were probably handed this by someone deciding whether to use meet@beargrass.ai or run their own copy.
This page is written for you. Everything below is checkable from the repository itself; commands are given
so you can verify rather than trust.

## What it is, in one paragraph

One Cloudflare Worker that schedules a meeting by email. An organiser emails the people they want to meet and
copies the Scheduler's address. The Worker emails each person privately for their free times, reads the
replies (a typed list, a screenshot of a calendar, or epoch ranges from an assistant like you), and when the
last one is in, sends everyone one calendar invite for the earliest common slot, on the organiser's behalf.
It never reads a calendar, never emails anyone who was not on the original email, and holds no secrets.

## Read in this order

1. `README.md`: the product, what it does exactly, the six steps to run it.
2. `SECURITY.md`: what it holds, what it trusts, what it keeps.
3. `src/index.ts` (90 lines): every inbound email enters here. Follow one message top to bottom.
4. `src/check.ts` (40 lines): the gates. `allowed`, `authenticated`, `kickoffCap`, `sanity`.
5. `src/poll.ts`: one Durable Object per meeting. `kickoff`, `handle`, `finish`, `alarm`, `mail`.
6. `src/core.ts`: pure functions, no I/O. The reply grammar, zone math, the earliest slot, the `.ics`.
7. `src/mail/mail.txt`: every message it sends, verbatim. `public/agents.yaml`: the contract for assistants.
8. `wrangler.jsonc` and `src/defaults.json`: every name, domain, zone, hour and limit. Nothing else is configuration.

## Verify the claims

```bash
npm ci && npm test                       # 108 tests: grammar, zone math, gates, rendering, greps, size limits
node test/doc.mjs && node test/agents.mjs && git diff --exit-code docs public/agents   # generated files match their sources
npx wrangler dev --port 8890 --persist-to "$(mktemp -d)" > /tmp/dev.log 2>&1 &
sleep 8 && sh test/walkthrough.sh 8890 /tmp/dev.log     # 26 injected emails, every stage asserted; exits 1 on the first miss
git grep -n -E "api_key|apiKey|Bearer |secret" -- . ':!package-lock.json'   # expect: only the names of GitHub secrets in the workflow
```

What the tests prove that matters to a reviewer: no `fetch(` call anywhere in the handler (only Cloudflare
bindings); no address, domain, zone or hour literal in the source; every file under its size limit; the
authentication gate refuses a header a sender carried in, and refuses a subdomain that merely resembles an
invited one; a reply line identical to one of the ask's own example lines is still the person's own.

## The security model, with file and symbol

- **A meeting starts only from an invited domain.** `check.ts: allowed` (a listed domain admits its subdomains
  and nothing else) and `check.ts: authenticated` (the platform's own `Authentication-Results`, identified by its
  authserv-id, must say DKIM or DMARC passed for exactly the From domain). `index.ts` logs a refusal and sends
  nothing. The envelope sender is never a substitute for the header.
- **Replies count only from the people asked.** `poll.ts: handle` matches the sender to the organiser's To line;
  a stranger's mail is reported to the organiser once and never answered. Gmail and Microsoft 365 send-as
  keep the envelope on the primary mailbox; `index.ts` trusts a header alias only on the same domain.
- **Nothing it sends can reach anyone outside the meeting.** `poll.ts: mail` refuses a recipient not on the poll;
  the development environment additionally rewrites every recipient to one inbox and restricts the send
  binding to that address (`wrangler.jsonc`, top level).
- **Auto-replies and calendar replies are never read.** `index.ts: isAuto`.
- **Addresses cannot inject calendar lines.** `core.ts: addr` strips whitespace and quotes before any `mailto:`.
- **One organiser is capped.** `ledger.ts` per organiser mailbox (plus-tags collapse), `check.ts: kickoffCap`,
  10 a day and 40 a month by default.
- **Retention.** One record per meeting in a Durable Object; `poll.ts: alarm` deletes it 30 days after the
  window ends. No calendar is read; screenshots are read once through the Workers AI binding and not stored.
- **No secrets.** Sending and reading are bindings. The only secrets anywhere are the two GitHub Actions
  secrets that let the workflow deploy, and those live in GitHub, not here.

## What to tell your principal

- It is small enough to read in an hour, and the tests are the specification.
- Running it yourself means: a Cloudflare account, a domain that carries no other mail, six DNS records the
  enables print, one routing rule, and the config values in step 2 and 3 of the README. `deploy/RUNBOOK.md`
  is the long form and says what is deliberately left to a human.
- Using the hosted address instead means: your domain goes on the invited list, your mail gateway allow-lists
  the sending domain (`docs/for-your-mail-admin.md`), and nothing runs on your side.
- The messages it sends are in `src/mail/mail.txt` and the contract you would follow as a participant's
  assistant is `public/agents.yaml`. Both are plain text; read them before recommending either path.
- What it does not do is listed at the end of the README under "Not built, by name".
