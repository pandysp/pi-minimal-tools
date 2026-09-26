import { stripTerminalSequences } from "@earendil-works/pi-tui";

// Claude Code's dot and colours as measured from Claude Code 2.1.280 (test-plan.md R9).
// Kept separate from dots.ts on purpose, so the tests check the colours instead of repeating them.
export const DOT = "⏺";
export const GREEN = "\x1b[38;5;114m";
export const RED = "\x1b[38;5;211m";
export const GREY = "\x1b[38;5;246m";

/** Visible text only: terminal codes removed, trailing spaces trimmed. */
export const plain = (lines: string[]) => lines.map((l) => stripTerminalSequences(l).trimEnd());
