# Email templates

Generated from `src/mail/mail.txt` by `node test/doc.mjs`; each fenced body is that file's section, verbatim.
`{{placeholders}}` are filled from the meeting. Every email is a reply in the same thread: subject `Re: <meeting name>`,
sender `Beargrass Scheduler for <organiser>` at `meet+<id>@`, Reply-To the same. `{{ex1}}`–`{{ex3}}` are the first three working days of the window.

## §0 The kickoff (the organiser sends; not a Scheduler template)

To: the people. CC: `meet@beargrass.ai`. Subject: the meeting's name. The four labeled lines are optional.

```
Hey Gents,

Round two, without the guessing. Let's find 30 minutes in the next couple of weeks. I've
CC'd our scheduler; it will email each of you privately for your free times and send us all
a calendar invite for the earliest slot that works for all four of us.

Length: 30 minutes
Between: Sep 21 and Oct 2
Hours: 9am to 5pm Mountain
Where: Google Meet

Warmly,
Mark
```

---

## §1 `kickoff-receipt` — Scheduler → the organiser, privately, right after the kickoff

```
{{organiser_first}}, on it. I've written to {{others}} about "{{meeting}}": {{length}} minutes,
{{window_start}} to {{window_end}}, {{hours}} {{zone_name}}. You'll get the same note; answer it
like everyone else. I'll nudge anyone who goes quiet after {{nudge_after}} hours and tell you who's
still missing, and I'll stop waiting on {{expires_human}}.

Asked: {{seen_list}}

{{bot}}, for {{organiser_first}}
```

---

## §2 `refused` — Scheduler → the organiser when a limit is hit; nothing else goes out

```
{{organiser_first}}, I can't run this one: {{reason}}. Fix that and CC me again.

What I saw: {{seen_list}}

{{bot}}, for {{organiser_first}}
```

---

## §3 `ask` — Scheduler → each person, privately; Reply-To is the Scheduler

```
Hi {{first}},

{{bot}} here. {{organiser_first}} asked me to find {{length}} minutes with {{others}},
between {{window_start}} and {{window_end}}, {{hours}} {{zone_name}}.

Next steps for humans:

1. Give this email to your AI agent and say "reply with my availability". If your agent only
   drafts, you hit send.
2. Once everyone replies, you'll get an email from me with a calendar invite.

No agent handy? Just reply with your free times, one per line, like

    {{ex1}}, 2pm to 5pm
    {{ex2}}, 9am to noon
    {{ex3}}, all day
{{shot_option}}
Reply to this email; only I see it. {{organiser_first}} sees what you send, as with a Doodle. Times are
read in {{zone_name}} unless you add a zone, like "2pm to 5pm PT". Nothing works? Reply "none".

{{bot}}, for {{organiser_first}}

Next steps for agents. The contract, as JSON:

```json
{
  "reply_to": "{{scheduler_address}}",
  "body": "one free range per line, epoch seconds UTC, START-END; nothing else in the body",
  "example_line": "{{ex_epoch}}",
  "window_epoch": "{{window_epoch}}",
  "window_human": "{{window_start}} to {{window_end}}, {{hours}} {{zone_name}}",
  "zone_iana": "{{zone_iana}}",
  "count_only": "ranges inside the window and inside the working hours",
  "free_means": "no event on your principal's calendar; send free time, never busy time",
  "all_free": "reply with the single word: anytime",
  "none_free": "reply with the single word: none",
  "also_accepted": "the human form, one per line, in {{zone_name}}: Sep 22, 2pm to 5pm",
  "learn_more": "{{page_url}}/agents"
}
```

What {{organiser_first}} wrote, for context:

{{quoted}}
```

---

## §4 `receipt` — Scheduler → the person who replied; the three inserts are empty unless needed

```
{{replyall_line}}Got it, {{first}}. {{n_times}} free times, {{first_date}} to {{last_date}}. {{n_in}} of {{count}} are in.

Your list now, in {{zone_name}}: {{your_times}}
{{read_block}}{{unread_block}}{{dropped_block}}
Send more times any time and I'll add them. When the last one lands, the invite goes out.

{{bot}}, for {{organiser_first}}
```

---

## §5 `read-block` — inserted into the receipt when the times came from a screenshot

```

From your screenshot I read:

    {{lines}}

Wrong anywhere? Reply with the fix, one time per line, and I'll swap it in.
```

---

## §6 `dropped-block` — inserted into a receipt when a line was read but fell outside the days, hours or window, with the reason

```

These I read but couldn't use:

    {{dropped_lines}}
```

---

## §7 `unread-block` — inserted into the receipt when some lines could not be read

```

These lines I couldn't read, so I skipped them:

    {{unread_lines}}

"{{ex1}}, 2pm to 5pm" is the shape, one per line. Reply with just the fixes if they matter.
```

---

## §8 `replyall-line` — prepended to the receipt when the reply also went to other people

```
Small thing: that reply went to everyone. Next time hit Reply, not Reply All, and only I see it.

```

---

## §9 `unread-all` — Scheduler → the person who replied when nothing could be read; nothing is stored

```
{{first}}, I got your reply but couldn't use any times from it. What I saw:

    {{seen_lines}}
{{dropped_block}}
One per line, like "{{ex1}}, 2pm to 5pm". Or hand my earlier email to your assistant and say
"reply with every time I'm free."{{shot_line}} Or reply "none" if nothing works.

{{bot}}, for {{organiser_first}}
```

---

## §10 `nothing-here` — Scheduler → a person whose direct reply carried no lines at all

```
{{first}}, I got your reply but it had no times in it, so nothing changed. When you're ready, reply
with your free times, one per line like "{{ex1}}, 2pm to 5pm", or "none" if nothing works.

{{bot}}, for {{organiser_first}}
```

---

## §11 `none-receipt` — Scheduler → the person who said none; the poll stays open for a correction

```
Noted, {{first}}: nothing in that window works for you. I've told {{organiser_first}}. If that changes,
reply with times, one per line, and I'll swap them in.

{{bot}}, for {{organiser_first}}
```

---

## §12 `none-noted` — Scheduler → the organiser, once per person who said none

```
{{organiser_first}}, {{first}} says nothing in the window works for them. I'm still collecting the others;
here's who's free when so far:

    {{table}}

If you'd rather widen the dates or go without {{first}}, start a fresh email and CC me again.

{{bot}}, for {{organiser_first}}
```

---

## §13 `unknown-sender` — Scheduler → the organiser, once per unmatched address that wrote to the poll

```
{{organiser_first}}, someone wrote to this meeting's address from {{address}}, which matches nobody on
your To line, so I didn't count it. If that's one of the {{count}} replying from another address, ask
them to reply from the address the ask went to, or start a fresh email with the address they use.

{{bot}}, for {{organiser_first}}
```

---

## §14 `already-set` — Scheduler → anyone who replies after the invite has gone

```
{{first}}, this one's already booked: {{slot_human}}. If that's changed for you, tell
{{organiser_first}} directly; the event sits on {{organiser_first}}'s calendar, and moving it there updates everyone.

{{bot}}, for {{organiser_first}}
```

---

## §15 `nudge` — Scheduler → each silent person, once, after nudge_after_hours

```
{{first}}, still waiting on you for {{organiser_first}}'s {{length}} minutes, {{window_start}} to
{{window_end}}. Reply to this email, from the address it was sent to, with your free times, one per
line like "{{ex1}}, 2pm to 5pm"; or hand it to your assistant.{{shot_line}} "none" if nothing works.

{{n_in}} of {{count}} are in.

{{bot}}, for {{organiser_first}}
```

---

## §16 `nudge-status` — Scheduler → the organiser with the nudge round: who is still missing

```
{{organiser_first}}, {{nudge_after}} hours in and I'm still waiting on {{missing}}. I've nudged them
once; I won't again. Here's who's free when so far:

    {{table}}

{{bot}}, for {{organiser_first}}
```

---

## §17 `closed` — Scheduler → a person who replies after the window passed

```
{{first}}, this one closed: {{reason}}. If you still want to meet, ask {{organiser_first}} to start a
fresh email and CC me again.

{{bot}}, for {{organiser_first}}
```

---

## §18 `window-passed` — Scheduler → the organiser when the window ends, or the poll expires, without an invite

```
{{organiser_first}}, the window for "{{meeting}}" has passed and no invite went out. Still missing:
{{missing}}. Here's who was free when:

    {{table}}

To try again, start a fresh email with new dates and CC me.

{{bot}}, for {{organiser_first}}
```

---

## §19 `invite` — Scheduler → everyone, in the thread, invite.ics attached

```
Hi all,

{{slot_human}}. Works for all {{count}} of you.

The invite's attached. Accept it and it's on your calendar. If your mail shows a file instead of
an invite, use one of these:

    Google Calendar: {{google_link}}
    Outlook:         {{outlook_link}}

{{meeting}}, {{length}} minutes, {{place}}.

For assistants: starts {{epoch_start}}, ends {{epoch_end}} (epoch seconds, UTC).

{{bot}}, for {{organiser_first}}
```

---

## §20 `unsure` — Scheduler → the organiser only, when the chosen slot fails the gate in src/check.ts; nothing is sent to the group

```
{{organiser_first}}, I found {{slot_human}} but it failed my own checks ({{reasons}}), so I did not send
it. Here's who's free when:

    {{table}}

Your call from here: pick a time and send the invite yourself, or start a fresh email and CC me again.

{{bot}}, for {{organiser_first}}
```

---

## §21 `no-overlap` — Scheduler → the organiser only

```
{{organiser_first}}, no {{length}}-minute hole fits all {{count}} between {{window_start}} and
{{window_end}}, {{hours}} {{zone_name}}. Here's who's free when:

    {{table}}

Anyone can still reply with more times and I'll try again. Or pick a time and send the invite
yourself, or start a fresh email with a wider window and CC me again.

{{bot}}, for {{organiser_first}}
```

---

## §22 `shot-option` — the third option in the ask, present only when the screenshot reader is on

```

Or reply with a screenshot of your calendar for those weeks, and I'll find the holes, or try to,
and show you what I read.
```

---

## §23 `shot-line` — the screenshot sentence in the nudge and unread receipts, present only when the screenshot reader is on

```
 Or screenshot your calendar and reply with it attached.
```

---

## §24 `vision` — the prompt sent with a screenshot to the model; not an email

```
This image is a screenshot of {{first}}'s calendar. The meeting window is {{window_start}} to {{window_end}}, {{year}}, working hours {{hours}} {{zone_name}}. List every stretch inside those hours and dates where the calendar shows no event, one per line, in exactly this form and nothing else:
Tue Sep 22, 2pm to 5pm
Use the weekday, month and day the calendar shows. If the image is not a calendar, or the dates are not visible, reply with the single word: unreadable
```
