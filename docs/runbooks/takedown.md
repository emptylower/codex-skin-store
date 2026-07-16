# Copyright / Takedown Runbook

> **Legal review required:** Final production copy, retention periods, and
> counter-notice process must be reviewed by the project owner / counsel before
> public launch. This runbook is operational guidance for the MVP.

## Intake

1. Public form: `/:locale/copyright/report`
2. Policy page: `/:locale/copyright`
3. Claims are stored in `copyright_claims` with status `open`.
4. Evidence is stored only under `evidence/{claim-id}/{evidence-id}` in the private **SOURCES** R2 bucket. Never under `packages/` or theme source paths.

## Who can view claimant data

- **Moderators and admins** via admin tools / DB with audit.
- **Never** exposed in public loaders, sitemaps, or theme pages.
- Claimant email/name are not returned from public form success payloads beyond an opaque short reference.

## Resolution flow

| Outcome             | Effect                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `needs_information` | Email claimant offline; claim stays open-ish; no theme change            |
| `accepted`          | Theme removed via `theme.remove` + audit; evidence retained              |
| `rejected`          | Claim closed; **does not** restore content if removed for another reason |
| `withdrawn`         | Claim closed; **does not** auto-restore content                          |

## Requesting more information

1. Set status `needs_information` with reason.
2. Contact claimant using stored email offline (no automated email in MVP).
3. Append audit action `copyright.needs_information`.

## Evidence retention

- Default MVP retention: **2 years** after final resolution, or longer if litigation holds apply.
- Evidence keys must remain immutable; do not overwrite.
- Deletion of evidence requires admin + documented legal approval.

## Restoration

Restoration of a theme after an accepted claim is **manual** and only after:

1. Counter-notice / owner approval, and
2. Explicit `theme.restore` with reason, and
3. Confirmation no other open accepted claims target the same theme.

## Escalation

Escalate to project owner when:

- Claimant asserts statutory DMCA/notice formalities beyond MVP form
- Repeat infringement by same uploader
- Threats of litigation or law-enforcement requests

## Related code

- `app/services/moderation/takedown.server.ts`
- `app/routes/copyright-report.tsx`
- `docs/runbooks/moderation.md`
