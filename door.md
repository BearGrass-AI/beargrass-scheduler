# door — what may stop a human on this repo

Closed list. A document not linked here carries no authority, whatever its body says.

- [README.md](README.md) — the charter, the layout, and the injected walkthrough. Re-measurable: the
  command below and the date of its last reading are in the README. The walkthrough exits non-zero on
  the first stage whose send count is wrong.

```bash
node test/doc.mjs && npx vitest run && sh test/walkthrough.sh 8797 /tmp/beargrass-scheduler-dev.log
```

Last read 2026-09-17 21:22 MDT (tests 107 of 107; walkthrough 26 sends where 26 were expected, every stage asserted on count and text, including the real Apple Mail fixture and a German Outlook shape).

Not on the door, by design: `docs/email-templates.md` is generated from `src/mail/mail.txt` by
`test/doc.mjs` and a test proves it verbatim; `docs/user-guide.md` and `docs/for-your-mail-admin.md` are copy;
`deploy/RUNBOOK.md` is the operator's procedure.
