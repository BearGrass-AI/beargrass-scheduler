# Runbook: from this repo to a live Beargrass Scheduler

For the operator (Mark) or a deploy agent acting on his word in the turn. Every step here changes the
shared world; none is run by a build agent. Written 2026-09-16. Commands assume the repo root.

## 0. What "live" means

- Mail domain `beargrass.ai`: Email Routing delivers `meet@` and `meet+<id>@` to the Worker; Email Sending
  lets the Worker send from `meet+<id>@beargrass.ai`. The apex carries no other mail, so no other system
  is affected. `beargrassai.com` is untouched and shares no reputation.
- Page host `scheduler.beargrass.ai`: a custom domain on the production Worker; static assets only.
- Two Workers: `beargrass-scheduler` (the redirected environment; can only mail `mark@beargrassai.com`)
  and `beargrass-scheduler-production`.

## 1. One-time: the mail domain (dashboard or CLI, ~15 minutes)

```bash
sh deploy/setup.sh            # runs the enables below and prints the DNS records to add
```

Or by hand:

1. `npx wrangler email sending enable beargrass.ai` → add the printed DKIM/SPF records at the zone.
   Verify: `npx wrangler email sending list` shows `beargrass.ai` verified.
2. Email Routing on `beargrass.ai` (dashboard → Email → Email Routing → enable; it adds MX + SPF).
   Settings → subaddressing **on**. One rule: `meet@beargrass.ai` → Worker `beargrass-scheduler-production`.
   Until production exists, point the rule at `beargrass-scheduler` for the redirected walk.
   Verify: `dig +short MX beargrass.ai` shows the Cloudflare MX hosts.
3. DMARC on `beargrass.ai`: `_dmarc TXT "v=DMARC1; p=reject;"` (published; measured 2026-09-17).
   Also tighten `beargrassai.com` from `p=none` to `p=quarantine`: the Worker already refuses a forged
   kickoff, this stops it earlier.

## 2. One-time: secrets and the deploy identity

- Screenshot reader: no secret. It runs on Workers AI through the `AI` binding in `wrangler.jsonc`
  (model in `src/defaults.json`; Meta's license applies). Remove the binding to switch it off.
- For the GitHub workflow: repo secrets `CLOUDFLARE_API_TOKEN` (a token with Workers Scripts: Edit,
  Workers Routes: Edit on the `beargrass.ai` zone, Account Settings: Read; wrangler names any missing
  scope on the first run) and `CLOUDFLARE_ACCOUNT_ID`.

## 3. First deploy, redirected

```bash
npm ci && npm test
npx wrangler deploy            # the top-level environment: every recipient rewritten to mark@beargrassai.com
```

Then the real-mail reading nothing local can give: from `mark@beargrassai.com`, send one email to yourself
with `meet@beargrass.ai` on CC and the four labeled lines. Expect in your inbox: the organiser receipt,
one ask per address on the kickoff, and after you reply to the ask, the receipt. Open the invite when it
comes and note how Apple Mail and Gmail render the attachment. If anything lands in junk, stop and read the
headers (`Authentication-Results` must show dkim=pass and spf=pass for `beargrass.ai`).

## 4. Production

```bash
npx wrangler deploy --env production     # or: push to main, the workflow runs this
```

Move the routing rule to `beargrass-scheduler-production`. Walk it once with the plus-addresses
(`mark+erin@`, `mark+chris@`, `mark+zed@beargrassai.com`) as the participants; production mails only the
addresses on the kickoff, and those are all yours. Check the page at `https://scheduler.beargrass.ai/`.

## 5. The first real meeting

Reply on the thread, CC `meet@beargrass.ai`, the four lines. The one instrument still unread is an Outlook
attendee: inline invite or file. The add-to-Outlook link is beneath either way.

## 6. Rollback

`npx wrangler versions list --env production` then `npx wrangler rollback --env production`. Polls in
flight live in Durable Object storage and survive a rollback; a poll's alarm retries a failed invite hourly.

## 7. What is deliberately not automated

The enables, DNS, secrets and the routing rule: one-time acts on the account, done by a human once. The
deploy: by the workflow on push to `main`, which is the human's keystroke, or by hand.

## 8. Inviting an organisation, and the abuse address

Only an email whose From is on an invited domain can start a meeting (`organiser_domains` in `src/defaults.json`;
a listed domain admits its subdomains). One organiser may start 10 meetings a day and 40 a month
(`max_kickoffs_per_day`, `max_kickoffs_per_month`); past that they get the `refused` receipt with the reason.

- **Add a domain:** confirm with `dig +short TXT _dmarc.<domain>` that the domain publishes DMARC (their kickoffs
  must authenticate for exactly the From domain); add it to the list; run the tests; deploy. Send the organiser
  `docs/for-your-mail-admin.md` so their gateway allow-lists `beargrass.ai`.
- **Take a domain off:** remove it from the list; deploy. Open polls run to their end; no new ones start.
- **A meeting's record before its time:** the poll id is the tag in the address the participants replied to. The
  record removes itself 30 days after the window; there is no command to do it sooner yet, so the answer to a
  removal request is the date it expires.
- **Abuse address:** `meet-abuse@beargrass.ai` is an Email Routing rule to the operator's own inbox, set in the
  dashboard once. It is named on the page and in the mail-admin note.

## 9. The page behind Cloudflare Access (preview gate)

Until the invited organisations have seen and approved the page, it sits behind Access: one self-hosted
application over `beargrass.ai`, `www.beargrass.ai` and `scheduler.beargrass.ai` (all three serve the same
file), one policy allowing emails ending in an invited domain, one-time code by email. Nothing in the mail
points anyone at the page, so participants are unaffected.

```bash
CLOUDFLARE_API_TOKEN=<Access: Apps and Policies: Edit>  CLOUDFLARE_ACCOUNT_ID=<id>  sh deploy/access.sh
```

Needs Zero Trust enabled on the account once (free plan is enough) with One-time PIN as a login method, which
new accounts have by default. The same two objects can be made in the dashboard: Zero Trust → Access →
Applications → Add → Self-hosted; three public hostnames; a policy "Allow" with "Emails ending in" for each
invited domain. To lift the gate: remove the application. The order on launch day: the apex redirect rule off,
the Access application on, then the production deploy, then the repo flip, then the reply with the links.
