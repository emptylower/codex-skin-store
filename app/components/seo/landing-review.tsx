export type LandingReviewRow = {
  id: string;
  slug: string;
  indexStatus: string;
  rolloutBatch: number | null;
  eligibilityJson: string;
  enStatus?: string;
  zhStatus?: string;
};

type LandingReviewProps = {
  landings: LandingReviewRow[];
  locale: string;
};

export function LandingReviewTable({ landings, locale }: LandingReviewProps) {
  if (landings.length === 0) {
    return <p data-testid="seo-landings-empty">No registry landings.</p>;
  }

  return (
    <table className="seo-landing-review" data-testid="seo-landing-review">
      <thead>
        <tr>
          <th>Slug</th>
          <th>Index</th>
          <th>Batch</th>
          <th>Locales</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {landings.map((row) => (
          <tr key={row.id}>
            <td>
              <code>{row.slug}</code>
            </td>
            <td>{row.indexStatus}</td>
            <td>{row.rolloutBatch ?? "—"}</td>
            <td>
              en:{row.enStatus ?? "—"} / zh:{row.zhStatus ?? "—"}
            </td>
            <td>
              <form method="post" action={`/${locale}/admin/seo-landings`}>
                <input type="hidden" name="landingId" value={row.id} />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={crypto.randomUUID()}
                />
                <label>
                  Reason
                  <input name="reason" required minLength={3} />
                </label>
                <label>
                  Batch
                  <input name="rolloutBatch" type="number" min={1} />
                </label>
                <button type="submit" name="intent" value="approve">
                  Approve
                </button>
                <button type="submit" name="intent" value="pause">
                  Pause
                </button>
                <button type="submit" name="intent" value="retire">
                  Retire
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
