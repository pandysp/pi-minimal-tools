import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { dot } from "./dots";
import { loud } from "./loud";

/**
 * A stock tool with Claude Code's dot in front of its first visible line: grey while running,
 * green when it succeeded, red when it failed. Everything else is stock pi's drawing.
 * pi calls renderCall again on every update, and isPartial stays true until the final result.
 */
export function withDot<T extends ToolDefinition<any, any, any>>(stock: T): T {
	const stockCall = stock.renderCall!;
	const stockResult = stock.renderResult!;
	return {
		...stock,
		// No frame, like the bash rows: pi's box adds a blank line above and below. (Stock edit has none already.)
		renderShell: "self",
		renderCall: loud(stock.name, (args, theme, ctx) => {
			// Stock renderers reuse their previous component; never hand them ours (pi swallows the crash).
			const inner = stockCall(args, theme, { ...ctx, lastComponent: undefined });
			const state = ctx.isPartial ? "running" : ctx.isError ? "failed" : "succeeded";
			return {
				render(width: number) {
					// 2 columns narrower, so the dot fits without cutting anything off. A copy: pi's Text caches
					// and returns the same array on every draw.
					const lines = [...inner.render(width - 2)];
					const first = lines.findIndex((l) => stripTerminalSequences(l).trim() !== "");
					// After stock's own indent (colour codes and spaces), directly before the tool name.
					if (first !== -1) lines[first] = lines[first].replace(/^((?:\x1b\[[0-9;]*m| )*)/, `$1${dot(state)} `);
					return lines;
				},
				invalidate: () => inner.invalidate?.(),
			};
		}),
		renderResult: loud(stock.name, (result, options, theme, ctx) => stockResult(result, options, theme, { ...ctx, lastComponent: undefined })),
	};
}
