export type CodexTaskProps = {
  themeName: string;
};

/**
 * Structural Codex Task shell — labels only, no fake interactive chrome.
 */
export function CodexTask({ themeName }: CodexTaskProps) {
  return (
    <div className="codex-task" data-view="task">
      <header className="codex-task__header">
        <p className="codex-task__product">Codex · Task</p>
        <p className="codex-task__theme-name">{themeName}</p>
      </header>
      <div className="codex-task__body">
        <aside className="codex-task__sidebar" aria-label="Task steps">
          <ol className="codex-task__steps">
            <li>Plan</li>
            <li>Edit</li>
            <li>Verify</li>
          </ol>
        </aside>
        <section className="codex-task__main" aria-label="Task transcript">
          <h3 className="codex-task__panel-title">Transcript</h3>
          <p className="codex-task__line">User: Implement the theme simulator.</p>
          <p className="codex-task__line">
            Codex: Building an accessible Home/Task preview for {themeName}.
          </p>
        </section>
      </div>
    </div>
  );
}
