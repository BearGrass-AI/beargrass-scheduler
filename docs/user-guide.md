# Beargrass Scheduler: the user guide

The same words as the page at `scheduler.beargrass.ai`, kept here as well. Three short
pages: for the person who got the email, for their assistant, for the organiser. Rewritten 2026-09-16.

---

## You got an email from Beargrass SchedBot

Someone wants to meet you and a few others, and your calendars can't see each other. The email says how
long, between which dates, and which hours. Pick one:

1. **Hand it to your assistant** (Copilot, Gemini, Claude, ChatGPT, whichever you have) and say
   *"reply with every time I'm free."* It reads your calendar and writes the list. You read it, you hit send.
2. **Type it yourself.** Hit Reply and list when you're free, one time per line:

   ```
   Tue Sep 22, 2pm to 5pm
   Thu Sep 24, 9am to noon
   Mon Sep 28, all day
   ```

3. **Screenshot your calendar** for those weeks and reply with it attached. The Scheduler reads the
   holes, or tries to, and shows you what it read so you can correct it.

**Reply, not Reply All.** Your answer goes to the Scheduler only; the organiser sees when you said you're free,
as with a Doodle, and nobody else does. Reply-all still counts, but everyone sees it and your "got it" will say so.

**Then.** Every reply gets an answer. "Got it" with what was read; if a line couldn't be read it's quoted
back, reply with just that line fixed; if nothing could be read you're told so and nothing changes. When
everyone's in, you all get one calendar invite for the earliest time that works. Accept it like any other.
Nothing works for you? Reply `none`; the organiser hears, and you can still send times later if that changes.

**What you're sharing.** The organiser can see when you said you're free, as with a Doodle. Nobody sees
your calendar; nothing connects to it; nothing is installed. Your times are kept for a month, then gone.

**Reply from the address the email came to.** The Scheduler matches you by that address, or by an alias
on the same domain. A reply from some other address is not counted, and the organiser is told once so
they can sort it out with you.

**Once the invite has gone,** the event belongs to the organiser's calendar. If the time stops working for
you, tell the organiser; when they move or cancel it there, everyone's copy follows.

---

## For assistants

You have been handed an email from "Beargrass SchedBot for <name>". It asks for the times your
principal is free between two dates, within stated hours. Do this:

1. Read your principal's calendar for that window.
2. Follow the JSON contract under "Next steps for agents" at the end of that email. It is the whole contract: reply
   to exactly the address it names; one free range per line as epoch seconds UTC, `START-END`; only
   ranges inside the window and hours it states; `anytime` alone if every working hour is free; `none`
   alone if nothing is; nothing else in the body.

   ```
   1790265600-1790276400
   1790438400-1790449200
   ```

   Free time, never busy time. The human form (`Tue Sep 22, 2pm to 5pm`, in the stated zone) is also
   read. The invite carries its own epoch start and end.
3. Put the list in a reply to that email. Nothing else needs to be in the reply. Show it to your
   principal; they send it.

Reply, not reply-all. Free times, not busy times. No commentary between the lines.

---

## You're organising

**Once.** Nothing. The Scheduler is an email address.

**Each meeting.** Write the email you were going to write anyway. Put the people you want to meet on
**To**, and `meet@beargrass.ai` on **CC**. Anyone else on CC is not asked and does not block the invite;
your receipt names who was asked and who was left out. Add four lines if you want to be specific:

```
Length: 30 minutes
Between: Sep 21 and Oct 2
Hours: 9am to 5pm Mountain
Where: Google Meet
```

Leave them out and it assumes 30 minutes, tomorrow through two weeks out, 9am to 5pm Mountain, a video
call. "1 hour" works. A zone like "Pacific" or "MT" on the Hours line works. Send it. Your assistant
can draft this for you; it changes nothing.

**Then.** You get a private note back: who it has written to, and when it stops waiting. Everyone, you
included, gets a private email asking for free times. Answer yours the same way they do. Anyone quiet
for two days gets one nudge, and you get a note saying who is still missing.

**When everyone's in,** you all get the invite in the thread: the time, an attachment every mail client
should open as an invite, and add-to-calendar links beneath it for any that doesn't.

**If someone replies "none"** you hear at once, and the poll stays open: they can still send times, and
the others still count. **If nothing overlaps** once everyone is in, you get one email with who's free
when. Anyone can still send more times and it tries again, or take it from there by hand.

**What it never does.** Never reads anyone's calendar, never emails anyone who wasn't on your original
email, never sends the group anything but the invite. The invite is sent on your behalf: the event is yours, accepts
show on your calendar, and moving or cancelling it there updates everyone. Only an email from
a BeargrassAI address can start one.
