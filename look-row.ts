import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { dotInFront, rowState } from "./dotted-row";
import { loud } from "./loud";

export const LOOK_SUMMARY = {
	grep: "Searched for 1 pattern",
	find: "Searched for 1 pattern",
	ls: "Listed 1 directory",
} as const;

const nothing: Component = { render: () => [], invalidate() {} };

/** Only the drawing changes: a finished search/list is one line; Ctrl+O is stock pi. */
export function shortLook(name: keyof typeof LOOK_SUMMARY, stock: ToolRenderers): ToolRenderers {
	return {
		renderShell: "self",
		renderCall: loud(name, (args, theme, ctx) => {
			if (!ctx.expanded && !ctx.isPartial && !ctx.isError) return nothing;
			// Stock reuses its previous Text; never hand it our wrapper component.
			const call = stock.renderCall!(args, theme, { ...ctx, lastComponent: undefined });
			return ctx.expanded ? call : dotInFront(call, rowState(ctx));
		}),
		renderResult: loud(name, (result, options, theme, ctx) => {
			if (options.expanded || options.isPartial || ctx.isError) {
				// Failed calls show the whole error even without Ctrl+O, never a truncated preview.
				const expanded = options.expanded || ctx.isError;
				return stock.renderResult!(result, { ...options, expanded }, theme, { ...ctx, expanded, lastComponent: undefined });
			}
			const details = result.details;
			const limited = details?.matchLimitReached || details?.resultLimitReached || details?.entryLimitReached || details?.truncation?.truncated || details?.linesTruncated;
			const warning = limited ? `${theme.fg("warning", "[truncated]")} ` : "";
			// Put the warning first so a narrow pane never cuts it off behind the summary.
			const summary = `  ${warning}${theme.fg("muted", LOOK_SUMMARY[name])} ${theme.fg("muted", "(ctrl+o to expand)")}`;
			// A summary stays one screen line even in a narrow pane.
			return { render: (width) => [truncateToWidth(summary, width)], invalidate() {} };
		}),
	};
}
