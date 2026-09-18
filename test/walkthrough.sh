#!/bin/sh
# Injected walkthrough against a local dev server. Usage: sh test/walkthrough.sh <port> [logfile]
# Inbound mail is injected at /cdn-cgi/local/email; outbound sends are logged by the simulator, never delivered.
# Every stage asserts the send count and, where it matters, the text of a send; exit 1 on the first miss.
# Addresses are Mark's own test inboxes. Built messages carry the Authentication-Results pass the platform adds
# on delivery; X0 strips it to prove the gate. Real client messages are replayed from test/fixtures/clients/.
# Start the dev server with --persist-to "$(mktemp -d)": the ledger caps kickoffs per organiser and its state outlives a dev session.
P=${1:-8797}; LOG=${2:-/tmp/beargrass-scheduler-dev.log}; RUN=$(date +%s); U="http://localhost:$P/cdn-cgi/local/email"; OUT=.wrangler/tmp/email
ORG=mark@beargrassai.com; A=mark+erin@beargrassai.com; B=mark+chris@beargrassai.com; Z=mark+zed@beargrassai.com; MEET=meet@beargrass.ai
inject() { curl -s -o /dev/null -w "  -> $3: HTTP %{http_code}\n" --request POST "$U" --url-query "from=$1" --url-query "to=$2" --data-binary @"$3"; sleep 2; }
sends() { grep -c "send_email binding called" "$LOG"; }
session() { OUT=$(dirname "$(dirname "$(ls -t $OUT/*/email-text/*.txt | head -1)")"); echo "  session: $(basename "$OUT")"; } # other dev servers share .wrangler/tmp/email; read only this run's folder
last() { cat "$(ls -t $OUT/email-text/*.txt | sed -n "${1:-1}p")"; }
expect() { n=$(( $(sends) - N0 )); if [ "$n" -eq "$1" ]; then echo "  sends: $n (expected $1: $2)"; else echo "  FAIL: sends $n, expected $1: $2"; exit 1; fi; }
notsaw() { if last "${3:-1}" | grep -q "$1"; then echo "  FAIL: did not expect '$1' ($2)"; exit 1; else echo "  ok: $2"; fi; }
saw() { if last "${3:-1}" | grep -q "$1"; then echo "  ok: $2"; else echo "  FAIL: expected '$1' ($2) in:"; last "${3:-1}" | head -8; exit 1; fi; }
E() { node -e "console.log(Date.parse('$1')/1000)"; }
msg() { # file, from-header, to-header, cc-header, subject, msgid, references(space-separated ids; last = In-Reply-To), body
  { printf 'From: %s\nTo: %s\nAuthentication-Results: mx.cloudflare.net; dmarc=pass header.from=beargrassai.com\n' "$2" "$3"; [ -n "$4" ] && printf 'Cc: %s\n' "$4"
    printf 'Subject: %s\nDate: Wed, 16 Sep 2026 21:00:00 -0600\nMessage-ID: <%s>\n' "$5" "$6"
    [ -n "$7" ] && printf 'In-Reply-To: <%s>\nReferences: %s\n' "${7##* }" "$(echo "$7" | sed 's/[^ ]*/<&>/g')"
    printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\n\n%s\n' "$8"; } > "$1"; }
N0=$(sends); K="kickoff-$RUN@beargrassai.com"; ROOT="root-$RUN@beargrassai.com"

echo "1  kickoff inside an existing thread, three people on To, a note-taker on CC (ruling 1: CC is not asked)"
sed "s/kickoff-1@beargrassai.com/$K/; s/^References:.*/References: <$ROOT> <older-$RUN@example.org>/; s/^Cc: $MEET/Cc: $MEET, notes@example.org/" test/fixtures/kickoff.eml > /tmp/bs-k1.eml
printf '\nOn Wed, Sep 16, 2026 at 1:38 PM Someone <someone@example.org> wrote:\n> HISTORY-MARKER the whole thread used to ride along\n> From: Someone\n' >> /tmp/bs-k1.eml
inject $ORG $MEET /tmp/bs-k1.eml; session
ID=$(grep -o 'meet+[a-z2-7]*@' "$LOG" | tail -1 | tr -d '@'); SCHED="$ID@beargrass.ai"; echo "  poll address: $SCHED"
expect 5 "organiser receipt + four asks; the note-taker got nothing"
saw "not asked: notes@example.org" "the receipt names who was on CC and not asked" 5
saw "> Warmly," "the organiser's own words are quoted in the ask" 1; notsaw "HISTORY-MARKER" "the thread below the kickoff is not" 1

echo "3a Erin's assistant: two epoch ranges and one human line (envelope mark@, header mark+erin@, as Gmail sends)"
msg /tmp/bs-r1.eml "Erin <$A>" "$SCHED" "" "Re: Introductions" "r1-$RUN@beargrassai.com" "$K" "$(E 2026-09-22T20:00:00Z)-$(E 2026-09-22T23:00:00Z)
$(E 2026-09-24T15:00:00Z)-$(E 2026-09-24T18:00:00Z)
Mon Sep 28, all day"
inject $ORG "$SCHED" /tmp/bs-r1.eml
expect 6 "Erin's receipt"; saw "Got it, Erin" "identified by the header alias"
echo "3b Chris: anytime, above an Outlook quote"
msg /tmp/bs-r2.eml "$B" "$SCHED" "" "RE: Introductions" "r2-$RUN@beargrassai.com" "$K" "Anytime.

-----Original Message-----
From: Beargrass Scheduler for Mark
Tue Sep 22, 2pm to 5pm"
inject $B "$SCHED" /tmp/bs-r2.eml
expect 7 "Chris's receipt"
echo "3c Zed: the REAL Apple Mail message that failed on 2026-09-17, body quoted with '> ' (fixture replay)"
inject $Z "$SCHED" test/fixtures/clients/applemail-quoted-body.eml
expect 8 "Zed's receipt"; saw "Got it, Zed. 2 free times" "the quoted-own-text body was read"
echo "3t Erin writes 'Thanks!' to the private ask (ruling 2: a direct reply is always answered)"
msg /tmp/bs-t.eml "Erin <$A>" "$SCHED" "" "Re: Introductions" "t-$RUN@beargrassai.com" "$K" "Thanks!"
inject $A "$SCHED" /tmp/bs-t.eml
expect 9 "the couldn't-read receipt quoting what it saw"; saw "couldn't use any times from it" "Erin was answered, her times kept"; saw "Thanks!" "what it saw is quoted back"
echo "3m Erin adds one more line (ruling: merge and echo the whole list)"
msg /tmp/bs-m.eml "Erin <$A>" "$SCHED" "" "Re: Introductions" "m-$RUN@beargrassai.com" "$K" "Tue Sep 29, 9am to 10am"
inject $A "$SCHED" /tmp/bs-m.eml
expect 10 "Erin's merged receipt"; saw "Got it, Erin. 4 free times" "the earlier three are kept"; saw "Your list now, in Mountain:" "the whole list echoed"
echo "3g a German Outlook reply (Von:/Gesendet:, no quote marks) that quotes the ask's own example lines"
msg /tmp/bs-g.eml "Chris <$B>" "$SCHED" "" "AW: Introductions" "g-$RUN@beargrassai.com" "$K" "Passt: Thu Sep 24, 9am to 10am

Von: Beargrass Scheduler for Mark
Gesendet: Mittwoch, 16. September 2026
    Mon Sep 21, 2pm to 5pm
    Tue Sep 22, 9am to noon
    Wed Sep 23, all day"
inject $B "$SCHED" /tmp/bs-g.eml
expect 11 "Chris's receipt"; saw "Got it, Chris. 10 free times" "anytime kept, the examples not read as his"
echo "3u a stranger writes to the poll address, twice (ruling 2: the organiser hears once)"
msg /tmp/bs-u.eml "Someone <someone@example.org>" "$SCHED" "" "Re: Introductions" "u-$RUN@example.org" "$K" "Tue Sep 22, 2pm to 5pm"
inject someone@example.org "$SCHED" /tmp/bs-u.eml
expect 12 "one note to the organiser"; saw "from someone@example.org, which matches nobody" "the unknown-sender note"
inject someone@example.org "$SCHED" /tmp/bs-u.eml
expect 12 "no second note"
echo "3d Mark answers on the THREAD by Reply-All (In-Reply-To unknown, References = root, kickoff, unknown), Apple Mail quote"
msg /tmp/bs-r4.eml "Mark Ulett <$ORG>" "$A, $B, $Z" "$MEET" "Re: Introductions" "r4-$RUN@beargrassai.com" "$ROOT $K later-$RUN@example.org" "Thu Sep 24, 10:30am to noon
Mon Sep 28, 9am to 5pm

> On Sep 16, 2026, at 8:50 PM, Beargrass Scheduler for Mark <$SCHED> wrote:
> Tue Sep 22, 2pm to 5pm"
inject $ORG $MEET /tmp/bs-r4.eml
expect 14 "Mark's receipt with the reply-all note + the invite"
saw "Small thing: that reply went to everyone" "the reply-all note" 2
saw "starts [0-9]*, ends [0-9]* (epoch seconds, UTC)" "the invite carries its epoch start and end"
[ "$(grep -c "invite.ics" "$LOG")" -ge 1 ] && echo "  ok: invite.ics attached" || { echo "  FAIL: no attachment"; exit 1; }

echo "X1 organiser chatter on the thread after the invite: silent"
msg /tmp/bs-x1.eml "Mark Ulett <$ORG>" "$A" "$MEET" "Re: Introductions" "x1-$RUN@beargrassai.com" "$ROOT $K" "Sounds good, looking forward to it."
inject $ORG $MEET /tmp/bs-x1.eml
echo "X3 an out-of-office auto-reply: dropped"
{ printf 'From: Erin <%s>\nTo: %s\nSubject: Automatic reply: Introductions\nAuto-Submitted: auto-replied\nMessage-ID: <x3-%s@beargrassai.com>\nMIME-Version: 1.0\nContent-Type: text/plain\n\nI am out of the office.\nTue Sep 22, 2pm to 5pm\n' "$A" "$SCHED" "$RUN"; } > /tmp/bs-x3.eml
inject $A "$SCHED" /tmp/bs-x3.eml
echo "X0 a forged kickoff from the organiser domain with no authentication result: dropped"
sed "s/kickoff-1@beargrassai.com/forged-$RUN@beargrassai.com/; /^Authentication-Results:/d" test/fixtures/kickoff.eml > /tmp/bs-x0.eml
inject $ORG $MEET /tmp/bs-x0.eml
echo "X4 a late reply after the invite: the already-set receipt"
msg /tmp/bs-x4.eml "Erin <$A>" "$SCHED" "" "Re: Introductions" "x4-$RUN@beargrassai.com" "$K" "Wed Sep 30, 2pm to 3pm"
inject $A "$SCHED" /tmp/bs-x4.eml
expect 15 "only the already-set receipt; X0, X1, X3 sent nothing"; saw "already booked" "the already-set receipt"
echo "X5 the same reply delivered a second time under the same Message-ID: read once"
inject $ORG "$SCHED" /tmp/bs-r1.eml
expect 15 "no second already-set"

echo "5  second poll: Erin says none (HTML-only, the bare word), then corrects; Mark answers; the invite goes out (ruling 2: none is not fatal)"
msg /tmp/bs-k2.eml "Mark Ulett <$ORG>" "Erin <$A>" "$MEET" "Coffee" "kickoff2-$RUN@beargrassai.com" "" "Let's find a time."
inject $ORG $MEET /tmp/bs-k2.eml
ID2=$(grep -o 'meet+[a-z2-7]*@' "$LOG" | tail -1 | tr -d '@'); S2="$ID2@beargrass.ai"
expect 18 "organiser receipt + two asks"
{ printf 'From: Erin <%s>\nTo: %s\nSubject: Re: Coffee\nMessage-ID: <r5-%s@beargrassai.com>\nIn-Reply-To: <kickoff2-%s@beargrassai.com>\nMIME-Version: 1.0\nContent-Type: text/html; charset=utf-8\n\n<div dir="ltr">Hi Mark,<br>none<br>sorry!<br></div>\n' "$A" "$S2" "$RUN" "$RUN"; } > /tmp/bs-r5.eml
inject $A "$S2" /tmp/bs-r5.eml
expect 20 "Erin's none receipt + the organiser's none note"; saw "nothing in the window works for them" "the organiser's none note"
msg /tmp/bs-r6.eml "Erin <$A>" "$S2" "" "Re: Coffee" "r6-$RUN@beargrassai.com" "kickoff2-$RUN@beargrassai.com" "Tue Sep 22, 2pm to 5pm"
inject $A "$S2" /tmp/bs-r6.eml
expect 21 "Erin's correction receipt"; saw "Got it, Erin. 1 free time" "the correction replaced the none"
msg /tmp/bs-r7.eml "Mark Ulett <$ORG>" "$S2" "" "Re: Coffee" "r7-$RUN@beargrassai.com" "kickoff2-$RUN@beargrassai.com" "Tue Sep 22, 3pm to 4pm"
inject $ORG "$S2" /tmp/bs-r7.eml
expect 23 "Mark's receipt + the invite"; saw "Tuesday, September 22, 3:00 PM to 3:30 PM Mountain" "the earliest half hour inside both"

echo "6  a kickoff-shaped Reply-All on the finished thread, body quoted with > (Apple Mail), opens a new poll with the block read"
msg /tmp/bs-k3.eml "Mark Ulett <$ORG>" "Erin <$A>" "$MEET" "Re: Coffee" "kickoff3-$RUN@beargrassai.com" "kickoff2-$RUN@beargrassai.com" "> Second try, quoted the way Apple Mail sends a scripted body.
> 
> Length: 30 minutes
> Between: Oct 5 and Oct 9
> Hours: 9am to 5pm Mountain"
inject $ORG $MEET /tmp/bs-k3.eml
expect 26 "a third poll: organiser receipt + two asks"; saw "Oct 5 to Oct 9" "the new window"

echo; echo "PASS: 26 sends where 26 were expected. Every outbound text, in order:"
for f in $(ls -tr $OUT/email-text/*.txt | tail -26); do echo "--- $(basename "$f")"; cat "$f"; echo; done
