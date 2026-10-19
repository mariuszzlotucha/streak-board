/**
 * The check-off grid cell's looks (S-21): the four states must be told apart without reading the label, the icon sits
 * where the state has one, and the screen-reader label is the last child. The markup is rendered to a string, so no DOM
 * is needed. The colours themselves are gated by `scripts/token-contrast.mjs`.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GridCell from "@/components/tasks/GridCell";
import { cellLabel } from "@/lib/grid-labels";
import type { CellState } from "@/lib/grid-rules";

const STATES: readonly CellState[] = ["done", "missed", "open", "notJoined"];
const PREFIX = "Kasia, Mon 13 Oct";

const markup = Object.fromEntries(
  STATES.map((state) => [state, renderToStaticMarkup(createElement(GridCell, { state, labelPrefix: PREFIX }))]),
) as Record<CellState, string>;

function classOf(html: string): string {
  const match = /^<span class="([^"]*)"/.exec(html);
  if (!match) throw new Error(`no class on the cell's outer span: ${html}`);
  return match[1];
}

describe("GridCell", () => {
  it("draws the four states with four different looks", () => {
    const classes = STATES.map((state) => classOf(markup[state]));
    expect(new Set(classes).size).toBe(STATES.length);
  });

  it("shows its own icon for done, missed and open, and none for not joined", () => {
    const icons = { done: "lucide-check", missed: "lucide-x", open: "lucide-minus" } as const;
    for (const state of ["done", "missed", "open"] as const) {
      expect(markup[state].match(/<svg/g)).toHaveLength(1);
      expect(markup[state]).toContain(icons[state]);
    }
    expect(markup.notJoined).not.toContain("<svg");
  });

  it("draws the open cell as an outlined box on the card colour", () => {
    const classes = classOf(markup.open).split(" ");
    expect(classes).toContain("border-2");
    expect(classes).toContain("border-primary");
    expect(classes).toContain("bg-card");
    expect(classes).toContain("text-primary");
  });

  it("draws the not-joined cell as a plain muted square without a border", () => {
    const classes = classOf(markup.notJoined).split(" ");
    expect(classes).toContain("bg-muted");
    expect(classes.some((name) => name === "border" || name.startsWith("border-"))).toBe(false);
  });

  it("ends every cell with the screen-reader label of its state", () => {
    for (const state of STATES) {
      expect(markup[state]).toMatch(new RegExp(`<span class="sr-only">${cellLabel(PREFIX, state)}</span></span>$`));
    }
  });
});
