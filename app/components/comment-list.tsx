import { escapeCommentHtml } from "~/domain/comments/policy";

export type CommentListItem = {
  id: string;
  authorLabel: string;
  body: string | null;
  createdAt: number;
  isDeletedMarker: boolean;
  userId: string | null;
};

type CommentListProps = {
  locale: string;
  slug: string;
  themeId: string;
  comments: CommentListItem[];
  currentUserId: string | null;
  isThemeAuthor: boolean;
  labels: {
    heading: string;
    empty: string;
    deleted: string;
    delete: string;
    hide: string;
  };
};

export function CommentList({
  locale,
  slug,
  themeId,
  comments,
  currentUserId,
  isThemeAuthor,
  labels,
}: CommentListProps) {
  const action = `/${locale}/themes/${encodeURIComponent(slug)}/comments`;
  const returnPath = `/${locale}/themes/${slug}`;

  return (
    <section className="comment-list" aria-label={labels.heading}>
      <h2>{labels.heading}</h2>
      {comments.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id} data-testid="comment-item">
              <header>
                <strong>{comment.authorLabel}</strong>
                <time dateTime={new Date(comment.createdAt).toISOString()}>
                  {new Date(comment.createdAt).toLocaleString()}
                </time>
              </header>
              {comment.isDeletedMarker ? (
                <p className="comment-list__deleted">{labels.deleted}</p>
              ) : (
                <p
                  className="comment-list__body"
                  dangerouslySetInnerHTML={{
                    __html: escapeCommentHtml(comment.body ?? ""),
                  }}
                />
              )}
              <div className="comment-list__actions">
                {currentUserId && comment.userId === currentUserId ? (
                  <form method="post" action={action}>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="commentId" value={comment.id} />
                    <input type="hidden" name="themeId" value={themeId} />
                    <input type="hidden" name="returnPath" value={returnPath} />
                    <button type="submit">{labels.delete}</button>
                  </form>
                ) : null}
                {isThemeAuthor && !comment.isDeletedMarker ? (
                  <form method="post" action={action}>
                    <input type="hidden" name="intent" value="hide" />
                    <input type="hidden" name="commentId" value={comment.id} />
                    <input type="hidden" name="themeId" value={themeId} />
                    <input type="hidden" name="returnPath" value={returnPath} />
                    <button type="submit">{labels.hide}</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
