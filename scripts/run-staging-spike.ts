/**
 * Helper to trigger the Task 6 staging spike AFTER human approval.
 *
 * This script intentionally does not deploy. It only documents and optionally
 * pings an already-deployed spike URL.
 *
 * Approval-required remote steps:
 *   1. npx wrangler deploy --config wrangler.spike.jsonc --env staging
 *   2. gh workflow run pipeline-spike.yml -f spike_url=https://...
 *
 * Defaults that must stay conservative until the gate passes:
 *   ENABLE_GIF_UPLOADS=false
 *   ZIP_WRITER=fflate
 */

const spikeUrl = process.argv[2];

if (!spikeUrl) {
  console.log(`Usage: npx tsx scripts/run-staging-spike.ts <spike_url>

This does NOT deploy. Provide a spike URL that was deployed after approval.

Example (after approval):
  npx wrangler deploy --config wrangler.spike.jsonc --env staging
  npx tsx scripts/run-staging-spike.ts https://codex-skin-store-pipeline-spike-staging.workers.dev
  gh workflow run pipeline-spike.yml -f spike_url=https://codex-skin-store-pipeline-spike-staging.workers.dev
`);
  process.exit(1);
}

const res = await fetch(spikeUrl);
const text = await res.text();
console.log(`status=${res.status}`);
console.log(text);

if (!res.ok) {
  process.exit(1);
}
