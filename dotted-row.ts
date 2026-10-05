import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, stripTerminalSequences } from "@earendil-works/pi-tui";
import { dot } from "./dots";
import { loud } from "./loud";

/**
 * A stock tool with Claude Code's dot in front of its first visible line: grey while running,
 * green when it succeeded, red when it failed. Everything else is stock pi's drawing.
 * pi calls renderCall again on every update, and isPartial stays true until the final result.
 */
export function withDot(name: string, stock: ToolRenderers): ToolRenderers {
	const stockCall = stock.renderCall!;
	const stockResult = stock.renderResult!;
	return {
		// No frame, like the bash rows: pi's box adds a blank line above and below. (Stock edit has none already.)
		renderShell: "self",
		renderCall: loud(name, (args, theme, ctx) =>
			// Stock renderers reuse their previous component; never hand them ours (pi swallows the crash).
			dotInFront(stockCall(args, theme, { ...ctx, lastComponent: undefined }), rowState(ctx)),
		),
		renderResult: loud(name, (result, options, theme, ctx) => stockResult(result, options, theme, { ...ctx, lastComponent: undefined })),
	};
}

/** grey while running, red when failed, green when succeeded. pi keeps isPartial true until the final result (A12). */
export const rowState = (ctx: { isPartial: boolean; isError: boolean }) => (ctx.isPartial ? "running" : ctx.isError ? "failed" : "succeeded");

/** A component with the dot in front of its first visible line, drawn 2 columns narrower so the dot fits. */
export function dotInFront(inner: Component, state: Parameters<typeof dot>[0]): Component {
	return {
		render(width: number) {
			// A copy: pi's Text caches and returns the same array on every draw.
			const lines = [...inner.render(width - 2)];
			const first = lines.findIndex((l) => stripTerminalSequences(l).trim() !== "");
			// After stock's own indent (colour codes and spaces), directly before the tool name.
			if (first !== -1) lines[first] = lines[first].replace(/^((?:\x1b\[[0-9;]*m| )*)/, `$1${dot(state)} `);
			return lines;
		},
		invalidate: () => inner.invalidate?.(),
	};
}
