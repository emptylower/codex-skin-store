type DeliveryActionsProps = {
  locale: string;
  slug: string;
  labels: {
    download: string;
    copyPrompt: string;
  };
  /** When true, show confirmation button for post-OAuth copy_prompt resume. */
  resumeCopyPrompt?: boolean;
};

/**
 * Download + Copy Prompt controls for theme detail.
 * Anonymous users hit routes that create intents and redirect to sign-in.
 */
export function DeliveryActions({
  locale,
  slug,
  labels,
  resumeCopyPrompt = false,
}: DeliveryActionsProps) {
  const downloadHref = `/${locale}/themes/${encodeURIComponent(slug)}/download`;
  const promptHref = `/${locale}/themes/${encodeURIComponent(slug)}/prompt`;

  return (
    <div className="delivery-actions" data-testid="delivery-actions">
      <a
        className="delivery-actions__download"
        href={downloadHref}
        data-testid="download-theme"
      >
        {labels.download}
      </a>
      {resumeCopyPrompt ? (
        <a
          className="delivery-actions__copy"
          href={`${promptHref}?confirm=1`}
          data-testid="resume-copy-prompt"
        >
          {labels.copyPrompt}
        </a>
      ) : (
        <a
          className="delivery-actions__copy"
          href={promptHref}
          data-testid="copy-prompt-link"
        >
          {labels.copyPrompt}
        </a>
      )}
    </div>
  );
}
