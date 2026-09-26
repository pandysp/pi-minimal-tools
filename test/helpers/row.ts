import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

initTheme("dark");

/** pi's row component for step-by-step driving (running → streaming → finished → expand → collapse). */
export function liveRow(definition: ToolDefinition<any, any, any>, args: Record<string, unknown>) {
	const ui = { requestRender() {} } as unknown as TUI;
	const row = new ToolExecutionComponent(definition.name, "call-1", args, undefined, definition, ui, "/tmp");
	row.setArgsComplete();
	row.markExecutionStarted();
	return {
		render: (width = 200) => row.render(width),
		output: (text: string, { partial = false, isError = false } = {}) =>
			row.updateResult({ content: [{ type: "text", text }], isError }, partial),
		expand: (on: boolean) => row.setExpanded(on),
	};
}

/** Draw a row once: optional result, optionally expanded. Returns the rendered lines. */
export function renderRow(opts: {
	definition: ToolDefinition<any, any, any>;
	args: Record<string, unknown>;
	result?: { text: string; isError?: boolean };
	partial?: boolean;
	expanded?: boolean;
	width?: number;
}): string[] {
	const row = liveRow(opts.definition, opts.args);
	if (opts.result) row.output(opts.result.text, { partial: opts.partial, isError: opts.result.isError });
	if (opts.expanded) row.expand(true);
	return row.render(opts.width);
}

