# For your mail administrator

One page of facts about the mail the Beargrass Scheduler sends, so your gateway can let it through.
Written 2026-09-17; the DNS facts are re-measurable with the commands shown.

## What arrives, and when

| Message | From | To | Attachment |
|---|---|---|---|
| The ask: "someone wants to meet you, reply with your free times" | `meet+<12 letters>@beargrass.ai`, display name "Beargrass SchedBot for <organizer>" | each participant, privately | none |
| A receipt after each reply | the same address | the person who replied | none |
| One nudge after 48 hours of silence | the same address | the quiet participant | none |
| The invite | the same address, on the organizer's behalf | everyone on the organizer's To line | `invite.ics`, `text/calendar`, iTIP METHOD:REQUEST |

Every message also carries `Auto-Submitted: auto-generated`, `In-Reply-To` and `References` pointing at the
organizer's own email, and a plain-text part beside the HTML. Links appear only in the invite: an add-to-calendar
link for Google and one for Outlook, for clients that show the attachment as a file.

The `<12 letters>` tag is one meeting; it changes for every meeting. Allow-listing the domain, not an address, is
the right rule.

## Who can start one

Only an email whose From is on an invited domain, and whose DKIM or DMARC result at Cloudflare aligns with exactly
that domain, opens a meeting. A forged From is refused before anyone is written to. The invited domains are a
short list held by BeargrassAI; a domain is added by asking.

## Authentication, measured

```bash
dig +short MX beargrass.ai                    # route1/2/3.mx.cloudflare.net
dig +short TXT beargrass.ai | grep spf        # v=spf1 include:_spf.mx.cloudflare.net ~all
dig +short TXT cf2024-1._domainkey.beargrass.ai   # the DKIM public key, RSA-SHA256
dig +short TXT _dmarc.beargrass.ai            # v=DMARC1; p=reject;
```

Read 2026-09-17 through 1.1.1.1 and 8.8.8.8: all four present as shown. Outbound mail is signed by Cloudflare
Email Sending with the selector above; SPF and DKIM both align with `beargrass.ai`, and DMARC is at `reject`.
Google's receiving verdict on 2026-09-17 was `spf=pass dkim=pass dmarc=pass`.

## What to allow

- Sender domain `beargrass.ai`, any local part (`meet+*@`).
- Attachment type `text/calendar` from that domain, on messages whose subject begins with `Re:`.
- If your gateway rewrites links, the two add-to-calendar links are safe to rewrite; nothing depends on them.
- If your gateway strips `.ics` attachments from external senders, users still have the links, and the invite
  text states the time in words and as epoch seconds.

## What is stored, where, for how long

For one meeting: the names and addresses on the organizer's To line, the organizer's own words from the kickoff,
each participant's free times as they sent them, and the chosen slot. One record per meeting, on Cloudflare
(a Durable Object), deleted 30 days after the meeting window ends, or sooner if the poll is closed. Nothing is
read from any calendar. No third party receives any of it. A calendar screenshot, if a participant sends one, is
read once by a model running on Cloudflare Workers AI and is not stored.

## Contact

`meet-abuse@beargrass.ai` reaches a person. To be removed from the invited list, or to have a meeting's record
deleted early, write there.
