# Runbook: from this repo to a live Scheduler on your own domain

For whoever runs it. Every step here changes a live account; none is automated on purpose. Commands assume
the repo root. Names below (`beargrass.ai`, `meet`) are the reference deployment's; yours go in
`wrangler.jsonc` and `src/defaults.json`.

## 0. What "live" means

- A mail domain that carries no other mail: Email Routing delivers `meet@` and `meet+<id>@` to the Worker;
  Email Sending lets the Worker send from `meet+<id>@<domain>`. Because the domain carries nothing else, its
  reputation is the Scheduler's alone.
- Two Workers from one config: the top-level environment (every recipient rewritten to `REDIRECT_ALL_TO`,
  and the send binding itself restricted to that one address, so it can only ever mail you) and
  `--env production`, the only one that mails other people.
- Optionally a host for the pages in `public/`, or a separate site with `PAGE_URL` pointing at it.

## 1. One-time: the mail domain (~15 minutes)

```bash
sh deploy/setup.sh            # runs the enables below and prints the DNS records to add
```

Or by hand:

1. `npx wrangler email sending enable <domain>` and add the printed DKIM and SPF records at the zone.
   Verify: `npx wrangler email sending list` shows the domain enabled.
2. Email Routing on the domain (dashboard: Email, Email Routing, enable; it adds MX and SPF). Settings:
   subaddressing **on**. One rule: `meet@<domain>` to a Worker. A rule can only point at a Worker that exists,
   so run the first deploy in section 3 before this step and point the rule at the redirected Worker; move it
   to the production Worker in section 4.
   Verify: `dig +short MX <domain>` shows the Cloudflare MX hosts.
3. DMARC: `_dmarc TXT "v=DMARC1; p=reject;"`. The Worker refuses a forged kickoff itself; this stops it earlier.

## 2. One-time: the deploy identity

- The screenshot reader needs no secret: it is the `AI` binding in `wrangler.jsonc`, model in
  `src/defaults.json`. Meta's license applies, and Cloudflare enforces it once per account: until someone on
  the account has sent the model the single word `agree` (dashboard: Workers AI, Playground, pick the model,
  send `agree`), every call fails with error 5016 and a participant's screenshot gets the "couldn't read that"
  receipt instead of a reading (measured 2026-09-18). Do it before the first deploy. Remove the binding to
  switch the feature off.
- For the GitHub workflow: repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, Workers Routes:
  Edit on the zone, Account Settings: Read; wrangler names any missing scope on the first run) and
  `CLOUDFLARE_ACCOUNT_ID`.

## 3. First deploy, redirected

```bash
npm ci && npm test
npx wrangler deploy            # the top-level environment: every recipient rewritten to REDIRECT_ALL_TO
```

Then the reading nothing local can give: from an address on an invited domain, send one email to yourself
with `meet@<domain>` copied and the four labeled lines. Expect in your inbox the organizer receipt, one ask
per address on the email, and after you reply to the ask, a receipt. Read the ask and the receipt in every client your
people use, an Outlook app included: the HTML part carries its line breaks as `<p>` and `<br>`, not as a style,
because Outlook ignores styles. Open the invite when it comes and note how each client renders the attachment. If anything lands in junk, stop and read the headers:
`Authentication-Results` must show `dkim=pass` and `spf=pass` for your domain.

## 4. Production

```bash
npx wrangler deploy --env production     # or push to main and let the workflow run it
```

Move the routing rule to the production Worker. Walk it once with a few of your own addresses (plus-tags on
one mailbox work: `you+a@`, `you+b@`) as the participants; production mails only the addresses on the
kickoff, and those are all yours.

## 5. The first real meeting

Reply on a real thread, copy `meet@<domain>`, add the four lines. Watch the production log:

```bash
npx wrangler tail --env production --format json
```

Every decision is one JSON line: `kickoff.created`, `submit` with what was read, `invite.sent`,
`kickoff.rejected` with the header that failed. Read it once with real mail clients before inviting anyone else.

## 6. Rollback

`npx wrangler versions list --env production` then `npx wrangler rollback --env production`. Polls in flight
live in Durable Object storage and survive a rollback; a poll's alarm retries a failed invite hourly.

## 7. Inviting an organization, and the abuse address

Only an email whose From is on an invited domain can start a meeting (`organiser_domains` in
`src/defaults.json`; a listed domain admits its subdomains). One organizer may start 10 meetings a day and
40 a month (`max_kickoffs_per_day`, `max_kickoffs_per_month`); past that they get the `refused` receipt with
the reason.

- **Add a domain:** confirm with `dig +short TXT _dmarc.<theirs>` that they publish DMARC (their kickoffs must
  authenticate for exactly the From domain); add it to the list; run the tests; deploy. Send them
  `docs/for-your-mail-admin.md` so their gateway allow-lists your sending domain.
- **Take a domain off:** remove it from the list; deploy. Open polls run to their end; no new ones start.
- **A meeting's record before its time:** the record removes itself 30 days after the window; there is no
  command to do it sooner yet, so the answer to a removal request is the date it expires.
- **Abuse address:** route `meet-abuse@<domain>` to a person, once, in the dashboard. Name it on your page and
  in the mail-admin note.

## 8. What is deliberately not automated

The enables, DNS, secrets and the routing rule: one-time acts on the account, done by a human once. The
deploy: by the workflow on push to `main`, which is a human's keystroke, or by hand.
