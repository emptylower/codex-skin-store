type CommentFormProps = {
  locale: string;
  slug: string;
  themeId: string;
  draft?: string;
  signedIn: boolean;
  labels: {
    heading: string;
    placeholder: string;
    submit: string;
    signInToComment: string;
  };
};

/**
 * Standard form action — works without client JavaScript.
 * Anonymous submit is handled server-side via auth intent.
 */
export function CommentForm({
  locale,
  slug,
  themeId,
  draft = "",
  signedIn,
  labels,
}: CommentFormProps) {
  const action = `/${locale}/themes/${encodeURIComponent(slug)}/comments`;
  const returnPath = `/${locale}/themes/${slug}`;

  return (
    <section className="comment-form" aria-label={labels.heading}>
      <h2>{labels.heading}</h2>
      {!signedIn ? <p>{labels.signInToComment}</p> : null}
      <form method="post" action={action}>
        <input type="hidden" name="intent" value="post" />
        <input type="hidden" name="themeId" value={themeId} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <label>
          <span className="visually-hidden">{labels.heading}</span>
          <textarea
            name="body"
            rows={4}
            maxLength={4000}
            defaultValue={draft}
            placeholder={labels.placeholder}
            required
            data-testid="comment-body"
          />
        </label>
        <button type="submit" data-testid="comment-submit">
          {labels.submit}
        </button>
      </form>
    </section>
  );
}
