# Security

**Reporting.** Write to `meet-abuse@beargrass.ai`. A person reads it. Say what you found, where, and how to
reproduce it; you will hear back, and the fix lands here.

**What this Worker holds.** No secrets. It sends mail through a Cloudflare binding, stores one record per
meeting in a Durable Object, and reads screenshots through the Workers AI binding. There is no API key
anywhere in the code, the config, or the deploy.

**What it trusts.** Nothing a sender says about themselves. A meeting starts only when the From header is on an
invited domain and the platform's own `Authentication-Results` header, the one whose authserv-id is the
platform's, says DKIM or DMARC passed for exactly that domain. Replies count only from addresses on the
organizer's original To line. Auto-replies and calendar replies are never read. Addresses are sanitized before
they reach a calendar line. One organizer is capped per day and per month.

**What it keeps, and for how long.** The names and addresses on the organizer's To line, the organizer's own
words, each reply's free times, the chosen slot. Deleted 30 days after the meeting window ends. Nothing is
read from any calendar; nothing is shared with a third party. See `docs/for-your-mail-admin.md`.
