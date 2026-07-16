import { REPORT_REASONS } from "~/services/moderation/reports.server";

type ReportDialogProps = {
  locale: string;
  themeId: string;
  slug: string;
  open?: boolean;
  defaultReason?: string;
  labels: {
    heading: string;
    reason: string;
    details: string;
    submit: string;
    reasons: Record<string, string>;
  };
};

export function ReportDialog({
  locale,
  themeId,
  slug,
  open = false,
  defaultReason,
  labels,
}: ReportDialogProps) {
  const action = `/${locale}/report`;
  const returnPath = `/${locale}/themes/${slug}`;

  return (
    <details className="report-dialog" open={open} data-testid="report-dialog">
      <summary>{labels.heading}</summary>
      <form method="post" action={action}>
        <input type="hidden" name="targetType" value="theme" />
        <input type="hidden" name="targetId" value={themeId} />
        <input type="hidden" name="themeId" value={themeId} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <label>
          {labels.reason}
          <select
            name="reason"
            required
            defaultValue={defaultReason ?? ""}
            data-testid="report-reason"
          >
            <option value="" disabled>
              {labels.reason}
            </option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {labels.reasons[reason] ?? reason}
              </option>
            ))}
          </select>
        </label>
        <label>
          {labels.details}
          <textarea
            name="details"
            rows={3}
            maxLength={2000}
            data-testid="report-details"
          />
        </label>
        <button type="submit" data-testid="report-submit">
          {labels.submit}
        </button>
      </form>
    </details>
  );
}
