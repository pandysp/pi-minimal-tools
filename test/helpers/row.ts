import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

initTheme("dark");

/** pi's row component for step-by-step driving (running → streaming → finished → expand → collapse). */
export function liveRow(definition: ToolRenderers & { name: string }, args: Record<string, unknown>, { argsComplete = true } = {}) {
	const ui = { requestRender() {} } as unknown as TUI;
	const row = new ToolExecutionComponent(definition.name, "call-1", args, undefined, definition, ui, "/tmp");
	if (argsComplete) {
		row.setArgsComplete();
		row.markExecutionStarted();
	}
	return {
		render: (width = 200) => row.render(width),
		output: (text: string, { partial = false, isError = false, details = undefined as unknown } = {}) =>
			row.updateResult({ content: [{ type: "text", text }], isError, details }, partial),
		expand: (on: boolean) => row.setExpanded(on),
		/** While the model is still writing the arguments: new partial arguments, then the final ones. */
		streamArgs: (partial: Record<string, unknown>) => row.updateArgs(partial),
		completeArgs: (final: Record<string, unknown>) => {
			row.updateArgs(final);
			row.setArgsComplete();
			row.markExecutionStarted();
		},
	};
}

/** Draw a row once: optional result, optionally expanded. Returns the rendered lines. */
export function renderRow(opts: {
	definition: ToolRenderers & { name: string };
	args: Record<string, unknown>;
	result?: { text: string; isError?: boolean; details?: unknown };
	partial?: boolean;
	expanded?: boolean;
	width?: number;
}): string[] {
	const row = liveRow(opts.definition, opts.args);
	if (opts.result) row.output(opts.result.text, { partial: opts.partial, isError: opts.result.isError, details: opts.result.details });
	if (opts.expanded) row.expand(true);
	return row.render(opts.width);
}

