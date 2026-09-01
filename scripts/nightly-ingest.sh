#!/usr/bin/env bash
#
# Nightly manual ingest. Pulls the day's traces from Langfuse into a running
# Agent X-Ray, then prints what is now in the workspace.
#
#   ./scripts/nightly-ingest.sh
#   ./scripts/nightly-ingest.sh --min-spans 6 --limit 200
#
# Reads Langfuse credentials from the ORBIS .env, and Agent X-Ray settings from
# .env.local here. Override either with environment variables.

set -euo pipefail
cd "$(dirname "$0")/.."

ORBIS_ENV="${ORBIS_ENV:-$HOME/Desktop/practice/unified/unified_backend/.env}"

# Langfuse creds come from the traced service's own config
if [ -f "$ORBIS_ENV" ]; then
  set -a; . "$ORBIS_ENV"; set +a
else
  echo "! no ORBIS .env at $ORBIS_ENV — set LANGFUSE_* yourself" >&2
fi

# Agent X-Ray settings
[ -f .env.local ] && { set -a; . ./.env.local; set +a; }

export AGENTXRAY_ENDPOINT="${AGENTXRAY_ENDPOINT:-http://localhost:3000}"
export AGENTXRAY_SYNC_STATE="${AGENTXRAY_SYNC_STATE:-$HOME/.agentxray-sync.json}"

if [ -z "${AGENTXRAY_API_KEY:-}" ]; then
  echo "! AGENTXRAY_API_KEY is not set." >&2
  echo "  Issue one from the workspace sidebar, then:" >&2
  echo "    echo 'AGENTXRAY_API_KEY=axr_...' >> .env.local" >&2
  exit 1
fi

# a nightly job that silently posts into the void is worse than one that fails
if ! curl -sf -o /dev/null --max-time 5 "$AGENTXRAY_ENDPOINT"; then
  echo "! $AGENTXRAY_ENDPOINT is not responding." >&2
  echo "  Start it first:  npm run dev" >&2
  exit 1
fi

echo "── $(date '+%Y-%m-%d %H:%M') ─────────────────────────────"
python3 integrations/python/langfuse_sync.py \
  --limit "${LIMIT:-100}" \
  --min-spans "${MIN_SPANS:-4}" \
  --sleep 1.0 \
  "$@"

echo
echo "workspace now holds:"
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await a.from('runs').select('name,span_count,cost_usd,waste_usd,waste_share,created_at').order('created_at', { ascending: false });
if (!data?.length) { console.log('  (nothing yet)'); process.exit(0); }
const cost = data.reduce((s,r)=>s+r.cost_usd,0), waste = data.reduce((s,r)=>s+r.waste_usd,0);
const today = data.filter(r => new Date(r.created_at) > new Date(Date.now()-864e5)).length;
console.log(\`  \${data.length} runs (\${today} in the last 24h)\`);
console.log(\`  \\\$\${cost.toFixed(4)} analysed · \\\$\${waste.toFixed(4)} recoverable (\${cost?Math.round(waste/cost*100):0}%)\`);
console.log();
for (const r of data.slice(0,8))
  console.log(\`    \${r.name.slice(0,34).padEnd(35)} \${String(r.span_count).padStart(3)} spans  \\\$\${r.cost_usd.toFixed(4)}  \${String(Math.round(r.waste_share*100)).padStart(3)}%\`);
" 2>/dev/null || echo "  (summary unavailable)"
echo
echo "view at $AGENTXRAY_ENDPOINT/runs"
