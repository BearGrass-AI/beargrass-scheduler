#!/bin/sh
# access.sh — put the page behind Cloudflare Access until the invited organisations have approved it.
# One self-hosted application over the three hosts that serve the page; one policy: emails ending in an invited
# domain, one-time code by email. Run by the operator, once; not by an agent. 2026-09-17.
#
#   CLOUDFLARE_API_TOKEN=<token with Access: Apps and Policies: Edit>  CLOUDFLARE_ACCOUNT_ID=<id>  sh deploy/access.sh
#
# Prints every response. To lift the gate later: remove the application in Zero Trust → Access → Applications.
set -eu
: "${CLOUDFLARE_API_TOKEN:?a token with Access: Apps and Policies: Edit}"
: "${CLOUDFLARE_ACCOUNT_ID:?the account id}"
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access"
H1="Authorization: Bearer $CLOUDFLARE_API_TOKEN"; H2="Content-Type: application/json"

echo "1. the application: beargrass.ai, www.beargrass.ai, scheduler.beargrass.ai"
APP=$(curl -s -X POST "$API/apps" -H "$H1" -H "$H2" --data '{
  "name": "Beargrass Scheduler page (preview)",
  "type": "self_hosted",
  "domain": "beargrass.ai",
  "self_hosted_domains": ["beargrass.ai", "www.beargrass.ai", "scheduler.beargrass.ai"],
  "session_duration": "24h",
  "app_launcher_visible": false,
  "auto_redirect_to_identity": false
}')
echo "$APP"
APP_ID=$(printf '%s' "$APP" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1)
[ -n "$APP_ID" ] || { echo "no application id in the response; stop here"; exit 1; }

echo "2. the policy: emails ending in an invited domain"
curl -s -X POST "$API/apps/$APP_ID/policies" -H "$H1" -H "$H2" --data '{
  "name": "invited domains",
  "decision": "allow",
  "precedence": 1,
  "include": [
    { "email_domain": { "domain": "beargrassai.com" } },
    { "email_domain": { "domain": "mt.gov" } },
    { "email_domain": { "domain": "umt.edu" } },
    { "email_domain": { "domain": "fvcc.edu" } }
  ]
}'
echo
echo "3. check: expect a 302 to <team>.cloudflareaccess.com"
curl -s -o /dev/null -w "beargrass.ai -> %{http_code} %{redirect_url}\n" https://beargrass.ai/
curl -s -o /dev/null -w "scheduler.beargrass.ai -> %{http_code} %{redirect_url}\n" https://scheduler.beargrass.ai/
