export type CodexHomeProps = {
  themeName: string;
};

/**
 * Structural Codex Home shell — labels only, no fake interactive chrome.
 */
export function CodexHome({ themeName }: CodexHomeProps) {
  return (
    <div className="codex-home" data-view="home">
      <header className="codex-home__header">
        <p className="codex-home__product">Codex</p>
        <p className="codex-home__theme-name">{themeName}</p>
      </header>
      <div className="codex-home__body">
        <section className="codex-home__panel" aria-label="Recent sessions">
          <h3 className="codex-home__panel-title">Recent</h3>
          <ul className="codex-home__list">
            <li>Draft a release note</li>
            <li>Review pull request</li>
            <li>Summarize test failures</li>
          </ul>
        </section>
        <section className="codex-home__panel" aria-label="Workspace">
          <h3 className="codex-home__panel-title">Workspace</h3>
          <p className="codex-home__hint">
            Home shell layout for theme preview.
          </p>
        </section>
      </div>
    </div>
  );
}
