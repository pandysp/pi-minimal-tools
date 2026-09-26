import type { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Component, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { type CommandKind, classifyCommand } from "./classify";
import { dot } from "./dots";
import { loud } from "./loud";

type BashDefinition = ReturnType<typeof createBashToolDefinition>;
type RenderCall = NonNullable<BashDefinition["renderCall"]>;
type RenderResult = NonNullable<BashDefinition["renderResult"]>;
type RenderContext = Parameters<RenderCall>[2];
type BashResult = Parameters<RenderResult>[0];

/** Decided once by the result renderer, read by the call row at draw time. Absent until the first output. */
type Outcome = "streaming" | "succeeded" | "failed" | Exclude<CommandKind, "work">;
interface RowState {
	claudeRow?: Outcome;
}

const PREVIEW_LINES = 3;
const SUMMARY = { list: "Listed 1 directory", read: "Read 1 file", search: "Searched for 1 pattern" } as const;

/** grep and rg exit with code 1 when they find nothing. A single grep/rg with no output: a finished search. */
const NO_MATCH = "(no output)\nCommand exited with code 1";
const isNoMatch = (command: string, lines: string[]) =>
	classifyCommand(command) === "search" && /^(grep|rg)\s/.test(command.trim()) && lines.join("\n") === NO_MATCH;

/** Renders at draw time, so the call row sees the result even though pi builds it first. */
const lazy = (lines: (width: number) => string[]): Component => ({ render: lines, invalidate() {} });
const nothing = lazy(() => []);
const text = (content: string, width: number) => new Text(content, 0, 0).render(width);

/**
 * Stock bash with Claude Code-style rows. Execution, prompt tips and parameters stay stock.
 * Collapsed: our header with the dot, then stock's live output tail while running and our summary line or
 * 3-line preview when done. Expanded (Ctrl+O): stock pi's row, unchanged.
 */
export function claudeBash(stock: BashDefinition): BashDefinition {
	const stockCall = stock.renderCall!;
	const stockResult = stock.renderResult!;
	// Stock renderers reuse their own previous component; never hand them ours.
	const fresh = (ctx: RenderContext): RenderContext => ({ ...ctx, lastComponent: undefined });
	const rowState = (ctx: RenderContext) => ctx.state as RowState;

	return {
		...stock,
		// No frame: pi's box adds a blank line above and below every row, which dwarfs a one-line summary.
		renderShell: "self",
		renderCall: loud("bash", (args, theme, ctx) => {
			if (ctx.expanded) return stockCall(args, theme, fresh(ctx));
			return lazy((width) => {
				const outcome = rowState(ctx).claudeRow;
				if (outcome === "list" || outcome === "read" || outcome === "search") {
					return text(`  ${theme.fg("muted", `${SUMMARY[outcome]} (ctrl+o to expand)`)}`, width);
				}
				const colour = outcome === "succeeded" || outcome === "failed" ? outcome : "running";
				// The command is undefined while the model is still typing it; stock shows "$ ..." then too.
				const header = `${dot(colour)} ${theme.fg("toolTitle", theme.bold(`$ ${args.command ?? "..."}`))}`;
				const running = outcome === undefined ? [`  ${theme.fg("muted", "Running…")}`] : [];
				return text([header, ...running].join("\n"), width);
			});
		}),

		renderResult: loud("bash", (result, options, theme, ctx) => {
			const command = ctx.args?.command ?? "";
			const lines = outputLines(result);
			const kind = classifyCommand(command);
			const failed = ctx.isError && !isNoMatch(command, lines);
			// Until the first real output line arrives, the row stays at "Running…".
			if (options.isPartial && lines.length === 0) return nothing;
			const outcome: Outcome = options.isPartial ? "streaming" : failed ? "failed" : kind !== "work" ? kind : "succeeded";
			rowState(ctx).claudeRow = outcome;
			if (options.expanded) return stockResult(result, options, theme, fresh(ctx));
			// Let stock finish its own lifecycle (e.g. stop the timer its expanded view may have started).
			if (!options.isPartial) stockResult(result, options, theme, fresh(ctx));
			// Collapsed live tail: stock's drawing, but with scratch state, so it never sees the timer stock's own
			// call row starts. Otherwise an "Elapsed" line would appear after the first Ctrl+O (no counter: user).
			if (options.isPartial) {
				const scratch = { startedAt: undefined, endedAt: undefined, interval: undefined };
				return stockResult(result, options, theme, { ...fresh(ctx), state: scratch });
			}
			if (outcome !== "succeeded" && outcome !== "failed") return nothing;
			const shown = lines.slice(0, PREVIEW_LINES).map((l) => `  ${theme.fg("toolOutput", l)}`);
			const hidden = lines.length - PREVIEW_LINES;
			if (hidden > 0) shown.push(`  ${theme.fg("muted", `… +${hidden} lines (ctrl+o to expand)`)}`);
			// One screen line per preview line, however long the output line is.
			return lazy((width) => shown.map((l) => truncateToWidth(l, width)));
		}),
	};
}

/** Non-empty output lines, as the model received them. */
function outputLines(result: BashResult): string[] {
	const all = result.content
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
	return all.split("\n").filter((l) => l.trim() !== "");
}
