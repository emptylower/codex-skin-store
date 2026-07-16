# Moderation Runbook

## Roles

| Role | Capabilities |
| --- | --- |
| user | Report content |
| moderator | List/resolve reports; remove/restore themes & comments; review SEO landings; view copyright claims |
| admin | All moderator actions + suspend/restore uploads + change roles + export analytics |

Authorization is enforced in `app/domain/moderation/policy.ts` and re-checked against a fresh DB role in admin services.

## Console

- Reports: `/:locale/admin/reports` (`noindex,nofollow`)
- Theme actions: `/:locale/admin/theme`
- User actions: `/:locale/admin/user`
- SEO landings: `/:locale/admin/seo-landings`

All mutations require same-origin requests, non-empty reason, and an idempotency key.

## Audit

- Table: `moderation_actions` (append-only)
- Every state change records `before_json` / `after_json`
- No public update/delete API for audit rows

## Content removal / restore

1. Prefer resolving the related report with reason.
2. `theme.remove` sets `visibility=hidden`, `moderation_status=removed`.
3. `theme.restore` returns to the **prior safe state** from the last remove audit row (not blindly `public`/`clean`).
4. Comments use `removed_by_admin` / restore to prior non-deleted status.

## Copyright

See `docs/runbooks/takedown.md`. Accepted claims invoke theme removal; rejected/withdrawn do not auto-restore.

## Escalation

Escalate to project owner for legal threats, child-safety, malware, or coordinated abuse.
