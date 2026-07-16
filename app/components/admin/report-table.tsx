export type AdminReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: number;
  reporterId?: string | null;
};

type ReportTableProps = {
  reports: AdminReportRow[];
  locale: string;
  labels?: {
    empty?: string;
    target?: string;
    reason?: string;
    status?: string;
    actions?: string;
  };
};

export function ReportTable({ reports, locale, labels }: ReportTableProps) {
  if (reports.length === 0) {
    return (
      <p data-testid="admin-reports-empty">
        {labels?.empty ?? "No reports match the current filters."}
      </p>
    );
  }

  return (
    <table className="admin-report-table" data-testid="admin-report-table">
      <thead>
        <tr>
          <th>{labels?.target ?? "Target"}</th>
          <th>{labels?.reason ?? "Reason"}</th>
          <th>{labels?.status ?? "Status"}</th>
          <th>{labels?.actions ?? "Actions"}</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id} data-report-id={report.id}>
            <td>
              <code>
                {report.targetType}:{report.targetId}
              </code>
            </td>
            <td>{report.reason}</td>
            <td>{report.status}</td>
            <td>
              <form
                method="post"
                action={`/${locale}/admin/reports`}
                className="admin-inline-form"
              >
                <input type="hidden" name="reportId" value={report.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label>
                  Reason
                  <input name="reason" required minLength={3} />
                </label>
                <button type="submit" name="intent" value="resolve">
                  Resolve
                </button>
                <button type="submit" name="intent" value="dismiss">
                  Dismiss
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
