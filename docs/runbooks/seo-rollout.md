# SEO Rollout Runbook

## Principles

- Only **registry** landings (`seo_landings`) are routable.
- Arbitrary marketplace filters never create landing rows.
- Sitemap includes only `index_status = approved` + reviewed locale translations.
- Cap active programmatic landing URLs at **100** during MVP.

## Batch plan

1. Build candidate inventory with eligibility gates (6 themes, 3 creators, reviewed translation, intro, FAQ≥2, related≥2, uniqueness≥0.4).
2. Approve **50–100** pages per batch; set `rollout_batch`.
3. Submit sitemap / URL inspection in Search Console (**human approval required** — do not automate from CI).
4. Observe **2–4 weeks**: index coverage, impressions, crawl stats, duplicate clusters.
5. Manually sample review **≥10%** of the batch for thin/duplicate content.

## Pause criteria

Pause (`index_status = 'paused'`) when any of:

- Soft-404 or thin-content rate spikes
- Duplicate cluster growth vs prior batch
- Crawl budget waste (high fetch / low index)
- Legal or moderation incident on clustered content

## Rollback

```sql
UPDATE seo_landings
SET index_status = 'paused', updated_at = <now_ms>
WHERE rollout_batch = <batch>;
```

Re-deploy is not required; sitemap generation reads live D1 status.

## Audit

```bash
npx tsx --tsconfig tsconfig.cloudflare.json scripts/audit-seo-landings.ts
```

## Related

- `app/domain/seo/eligibility.ts`
- `app/services/seo/landings.server.ts`
- `docs/runbooks/deployment.md`
