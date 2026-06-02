#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx wrangler whoami >/dev/null 2>&1 || npx wrangler login
[ -f src/schema.sql ] && { echo "==> Applying src/schema.sql to D1 (chat-db)"; npx wrangler d1 execute chat-db --file=./src/schema.sql --remote || true; }
echo "==> Set Stripe secrets (Ctrl-C to skip)"
for s in STRIPE_API_KEY STRIPE_WEBHOOK_SECRET; do
  read -rp "Set $s now? [y/N] " a; [[ "$a" =~ ^[Yy]$ ]] && npx wrangler secret put "$s" || echo "  skipped $s"
done
grep -q 'YOUR_STRIPE_PRICE_ID' wrangler.jsonc && echo "!! Remember to set STRIPE_PRICE_ID (your Stripe price id) in wrangler.jsonc"
echo "==> Done. Deploy with: npm run deploy"
