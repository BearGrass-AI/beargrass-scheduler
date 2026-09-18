#!/bin/sh
# One-time account setup for the Beargrass Scheduler. Run by the operator, once, from the repo root.
# It enables Email Sending on the mail domain and prints the DNS records to add. Email Routing and its
# rule are dashboard acts today (see deploy/RUNBOOK.md §1.2); this script only checks them afterwards.
set -e
DOMAIN=${DOMAIN:-beargrass.ai}
echo "== who am I"; npx wrangler whoami | head -5
echo; echo "== Email Sending on $DOMAIN (prints DKIM/SPF records to add at the zone)"
npx wrangler email sending enable "$DOMAIN" || echo "   (already enabled, or add the records and re-run)"
echo; echo "== sending domains"; npx wrangler email sending list
echo; echo "== Email Routing check: MX for $DOMAIN (expect Cloudflare hosts once routing is enabled in the dashboard)"
dig +short MX "$DOMAIN" || true
echo; echo "== DMARC for $DOMAIN and for beargrassai.com (expect p=quarantine or p=reject)"
dig +short TXT "_dmarc.$DOMAIN" || true; dig +short TXT _dmarc.beargrassai.com || true
echo; echo "Next: deploy/RUNBOOK.md §2 (secrets) and §3 (first redirected deploy)."
