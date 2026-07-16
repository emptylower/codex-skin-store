import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemePreview } from "~/components/theme-preview/theme-preview";
import { getMessages } from "~/i18n/messages";

const messages = getMessages("en");

const previewTheme = {
  name: "Neon Road",
  coverImage: "/demo-themes/neon-road.png",
  previewImage: "/demo-themes/neon-road-cover.svg",
  mode: "dark" as const,
  platform: "both" as const,
  palette: {
    bg: "#0b1020",
    fg: "#f8fafc",
    accent: "#22d3ee",
    muted: "#94a3b8",
  },
  focalPoint: { x: 0.52, y: 0.38 },
  overlay: 0.4,
};

afterEach(() => {
  cleanup();
});

describe("ThemePreview", () => {
  it("renders a two-option tablist with Home and Task labels", () => {
    render(<ThemePreview theme={previewTheme} labels={messages.preview} />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();

    const home = screen.getByRole("tab", { name: messages.preview.home });
    const task = screen.getByRole("tab", { name: messages.preview.task });
    expect(home).toHaveAttribute("aria-selected", "true");
    expect(task).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "id",
      expect.stringContaining("home"),
    );
  });

  it("supports arrow-key navigation between Home and Task", () => {
    render(<ThemePreview theme={previewTheme} labels={messages.preview} />);

    const home = screen.getByRole("tab", { name: messages.preview.home });
    const task = screen.getByRole("tab", { name: messages.preview.task });

    home.focus();
    fireEvent.keyDown(home, { key: "ArrowRight" });
    expect(task).toHaveAttribute("aria-selected", "true");
    expect(home).toHaveAttribute("aria-selected", "false");
    expect(document.activeElement).toBe(task);

    fireEvent.keyDown(task, { key: "ArrowLeft" });
    expect(home).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(home);
  });

  it("keeps a stable aspect-ratio, bounded height, and labels when media fails", () => {
    const { container } = render(
      <ThemePreview theme={previewTheme} labels={messages.preview} />,
    );

    const shell = container.querySelector(".theme-preview");
    expect(shell).toBeTruthy();
    expect(shell?.getAttribute("style") ?? shell?.className).toBeTruthy();

    const frame = container.querySelector(".theme-preview__frame") as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.style.aspectRatio).toBe("16 / 10");
    expect(frame.style.maxHeight).toBe("28rem");

    const media = container.querySelector(
      ".theme-preview__media",
    ) as HTMLImageElement | null;
    expect(media).toBeTruthy();
    fireEvent.error(media!);

    expect(
      screen.getByRole("tab", { name: messages.preview.home }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: messages.preview.task }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(previewTheme.name).length).toBeGreaterThan(0);
  });

  it("does not render unlabeled fake interactive controls", () => {
    const { container } = render(
      <ThemePreview theme={previewTheme} labels={messages.preview} />,
    );

    const buttons = container.querySelectorAll("button, [role='button']");
    for (const button of buttons) {
      const accessible =
        button.getAttribute("aria-label") ||
        button.textContent?.trim() ||
        button.getAttribute("title");
      expect(accessible).toBeTruthy();
    }
  });
});
