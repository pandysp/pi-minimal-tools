import type { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { PREVIEW_LINES } from "./bash-row";
import { withDot } from "./dotted-row";
import { loud } from "./loud";

type WriteDefinition = ReturnType<typeof createWriteToolDefinition>;

/**
 * Stock write with the dot, showing only the first 3 lines of the content and `… +N lines`, like a bash
 * row's output. Stock draws the row from the cut content, so path, highlighting and errors stay stock.
 * Ctrl+O shows stock's full content.
 */
export function shortWrite(stock: WriteDefinition): WriteDefinition {
	const dotted = withDot(stock);
	const dottedCall = dotted.renderCall!;
	return {
		...dotted,
		renderCall: loud("write", (args, theme, ctx) => {
			const content: unknown = args?.content;
			if (ctx.expanded || typeof content !== "string") return dottedCall(args, theme, ctx);
			// Counted like stock: without \r and trailing empty lines.
			const lines = content.replace(/\r/g, "").split("\n");
			while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
			const row = dottedCall({ ...args, content: lines.slice(0, PREVIEW_LINES).join("\n") }, theme, ctx);
			const hidden = lines.length - PREVIEW_LINES;
			if (hidden <= 0) return row;
			const more = theme.fg("muted", `… +${hidden} lines (ctrl+o to expand)`);
			return { render: (width) => [...row.render(width), truncateToWidth(more, width)], invalidate: () => row.invalidate?.() };
		}),
	};
}
