import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { dotInFront, rowState } from "./dotted-row";
import { loud } from "./loud";

/** Claude Code's wording for looking around: the "-ing" form while the call runs, the past form once it is done. */
export const LOOK_WORDS = {
	search: { running: "Searching for 1 pattern…", done: "Searched for 1 pattern" },
	list: { running: "Listing 1 directory…", done: "Listed 1 directory" },
	read: { running: "Reading 1 file…", done: "Read 1 file" },
} as const;
export type LookKind = keyof typeof LOOK_WORDS;
/** What each dedicated tool does, in LOOK_WORDS terms. */
export const KIND = { grep: "search", find: "search", ls: "list" } as const;

/** One grey line, the same for the dedicated tools and look-around commands in bash. */
export const lookLine = (kind: LookKind, running: boolean, theme: { fg: (colour: "muted", text: string) => string }) =>
	`${theme.fg("muted", LOOK_WORDS[kind][running ? "running" : "done"])} ${theme.fg("muted", "(ctrl+o to expand)")}`;

const nothing: Component = { render: () => [], invalidate() {} };
const LIMITED = Symbol("limited");

/**
 * Only the drawing changes: a search/list is one line from the start ("Searching…", then "Searched…"),
 * so only its verb changes when the call finishes. A failure shows stock's row with the whole error; Ctrl+O is stock pi.
 */
export function shortLook(name: keyof typeof KIND, stock: ToolRenderers): ToolRenderers {
	return {
		renderShell: "self",
		renderCall: loud(name, (args, theme, ctx) => {
			if (!ctx.expanded && !ctx.isError) {
				// Drawn at draw time: the result decides whether the call was cut short.
				return {
					render: (width) => {
						const warning = (ctx.state as { [LIMITED]?: boolean })[LIMITED] ? `${theme.fg("warning", "[truncated]")} ` : "";
						// Put the warning first so a narrow pane never cuts it off behind the summary.
						const summary = `  ${warning}${lookLine(KIND[name], ctx.isPartial, theme)}`;
						// A summary stays one screen line even in a narrow pane.
						return [truncateToWidth(summary, width)];
					},
					invalidate() {},
				};
			}
			// Stock reuses its previous Text; never hand it our wrapper component.
			const call = stock.renderCall!(args, theme, { ...ctx, lastComponent: undefined });
			return ctx.expanded ? call : dotInFront(call, rowState(ctx));
		}),
		renderResult: loud(name, (result, options, theme, ctx) => {
			if (options.expanded || ctx.isError) {
				// Failed calls show the whole error even without Ctrl+O, never a truncated preview.
				const expanded = options.expanded || ctx.isError;
				return stock.renderResult!(result, { ...options, expanded }, theme, { ...ctx, expanded, lastComponent: undefined });
			}
			const details = result.details;
			(ctx.state as { [LIMITED]?: boolean })[LIMITED] = !!(details?.matchLimitReached || details?.resultLimitReached || details?.entryLimitReached || details?.truncation?.truncated || details?.linesTruncated);
			return nothing;
		}),
	};
}
