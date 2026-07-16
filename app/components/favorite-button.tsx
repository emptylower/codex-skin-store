type FavoriteButtonProps = {
  locale: string;
  themeId: string;
  slug: string;
  initialFavorited: boolean;
  labels: {
    add: string;
    remove: string;
  };
};

/**
 * Accessible favorite toggle via progressive form POST.
 * Works without client JavaScript (native form action).
 */
export function FavoriteButton({
  locale,
  themeId,
  slug,
  initialFavorited,
  labels,
}: FavoriteButtonProps) {
  const shown = initialFavorited;
  const op = shown ? "remove" : "add";
  const label = shown ? labels.remove : labels.add;
  const returnPath = `/${locale}/themes/${slug}`;
  const action = `/${locale}/favorite`;

  return (
    <form method="post" action={action} className="favorite-button">
      <input type="hidden" name="themeId" value={themeId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <button
        type="submit"
        aria-pressed={shown}
        aria-label={label}
        data-testid="favorite-button"
        data-favorited={shown ? "true" : "false"}
      >
        {shown ? "★" : "☆"} <span>{label}</span>
      </button>
    </form>
  );
}
