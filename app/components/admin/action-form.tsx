type ActionFormProps = {
  action: string;
  intent: string;
  targetId: string;
  targetIdField?: string;
  submitLabel: string;
  confirmMessage?: string;
  children?: React.ReactNode;
  destructive?: boolean;
};

/**
 * Shared admin action form. Requires non-empty reason + idempotency key.
 * Destructive actions should set confirmMessage for native confirm().
 */
export function ActionForm({
  action,
  intent,
  targetId,
  targetIdField = "targetId",
  submitLabel,
  confirmMessage,
  children,
  destructive = false,
}: ActionFormProps) {
  const idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `idem-${Date.now()}`;

  return (
    <form
      method="post"
      action={action}
      className="admin-action-form"
      data-testid={`admin-action-${intent}`}
      onSubmit={
        confirmMessage
          ? (event) => {
              if (!window.confirm(confirmMessage)) {
                event.preventDefault();
              }
            }
          : undefined
      }
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name={targetIdField} value={targetId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label>
        Reason
        <textarea name="reason" required minLength={3} rows={3} />
      </label>
      {children}
      <button
        type="submit"
        className={destructive ? "button-danger" : "button-primary"}
      >
        {submitLabel}
      </button>
    </form>
  );
}
