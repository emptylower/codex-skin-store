import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { CodexHome } from "./codex-home";
import { CodexTask } from "./codex-task";

export type ThemePreviewPalette = {
  bg?: string;
  fg?: string;
  accent?: string;
  muted?: string;
};

export type ThemePreviewModel = {
  name: string;
  coverImage?: string | null;
  previewImage?: string | null;
  mode?: "light" | "dark";
  platform?: string;
  palette?: ThemePreviewPalette | null;
  focalPoint?: { x: number; y: number } | null;
  overlay?: number | null;
};

export type ThemePreviewLabels = {
  home: string;
  task: string;
};

export type ThemePreviewProps = {
  theme: ThemePreviewModel;
  labels: ThemePreviewLabels;
};

type PreviewTab = "home" | "task";

const TABS: PreviewTab[] = ["home", "task"];

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function safeMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  // Allow site-relative paths and https URLs only.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

function buildShellStyle(theme: ThemePreviewModel): CSSProperties {
  const palette = theme.palette ?? {};
  const fx = clamp01(theme.focalPoint?.x, 0.5);
  const fy = clamp01(theme.focalPoint?.y, 0.5);
  const overlay = clamp01(theme.overlay ?? undefined, 0.35);

  return {
    ["--preview-bg" as string]: palette.bg ?? "#0f172a",
    ["--preview-fg" as string]: palette.fg ?? "#f8fafb",
    ["--preview-accent" as string]: palette.accent ?? "#38bdf8",
    ["--preview-muted" as string]: palette.muted ?? "#94a3b8",
    ["--preview-focal-x" as string]: `${fx * 100}%`,
    ["--preview-focal-y" as string]: `${fy * 100}%`,
    ["--preview-overlay" as string]: String(overlay),
  };
}

export function ThemePreview({ theme, labels }: ThemePreviewProps) {
  const baseId = useId();
  const [tab, setTab] = useState<PreviewTab>("home");
  const [mediaFailed, setMediaFailed] = useState(false);
  const homeTabRef = useRef<HTMLButtonElement>(null);
  const taskTabRef = useRef<HTMLButtonElement>(null);
  const focusTabRef = useRef<PreviewTab | null>(null);

  const mediaUrl = safeMediaUrl(theme.coverImage ?? theme.previewImage);
  const homeTabId = `${baseId}-tab-home`;
  const taskTabId = `${baseId}-tab-task`;
  const homePanelId = `${baseId}-panel-home`;
  const taskPanelId = `${baseId}-panel-task`;

  useLayoutEffect(() => {
    if (!focusTabRef.current) return;
    const target =
      focusTabRef.current === "home" ? homeTabRef.current : taskTabRef.current;
    focusTabRef.current = null;
    target?.focus();
  }, [tab]);

  function selectTab(next: PreviewTab, focus = false) {
    if (focus) focusTabRef.current = next;
    setTab(next);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = TABS.indexOf(tab);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    selectTab(TABS[nextIndex]!, true);
  }

  return (
    <section
      className="theme-preview"
      style={buildShellStyle(theme)}
      aria-label={`${theme.name} Codex preview`}
    >
      <div className="theme-preview__chrome">
        <p className="theme-preview__title">{theme.name}</p>
        <div className="theme-preview__tabs" role="tablist" aria-label="Codex views">
          <button
            type="button"
            role="tab"
            id={homeTabId}
            ref={homeTabRef}
            aria-selected={tab === "home"}
            aria-controls={homePanelId}
            tabIndex={tab === "home" ? 0 : -1}
            onClick={() => selectTab("home")}
            onKeyDown={onTabKeyDown}
          >
            {labels.home}
          </button>
          <button
            type="button"
            role="tab"
            id={taskTabId}
            ref={taskTabRef}
            aria-selected={tab === "task"}
            aria-controls={taskPanelId}
            tabIndex={tab === "task" ? 0 : -1}
            onClick={() => selectTab("task")}
            onKeyDown={onTabKeyDown}
          >
            {labels.task}
          </button>
        </div>
      </div>

      <div
        className="theme-preview__frame"
        style={{ aspectRatio: "16 / 10", maxHeight: "28rem" }}
      >
        {mediaUrl && !mediaFailed ? (
          <img
            className="theme-preview__media"
            src={mediaUrl}
            alt=""
            style={{
              objectPosition: `var(--preview-focal-x) var(--preview-focal-y)`,
            }}
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <div className="theme-preview__media-fallback" aria-hidden="true" />
        )}
        <div className="theme-preview__overlay" aria-hidden="true" />
        <div
          className="theme-preview__panel"
          role="tabpanel"
          id={tab === "home" ? homePanelId : taskPanelId}
          aria-labelledby={tab === "home" ? homeTabId : taskTabId}
        >
          {tab === "home" ? (
            <CodexHome themeName={theme.name} />
          ) : (
            <CodexTask themeName={theme.name} />
          )}
        </div>
      </div>
    </section>
  );
}
