import { type ExtensionAPI, highlightCode, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";
import { type Component, Text } from "@earendil-works/pi-tui";
import { shortCommand } from "./bash-row";
import { dotInFront, rowState } from "./dotted-row";
import { loud } from "./loud";

/**
 * pi's own codemode tool, built by its public factory with the real extension API: same description,
 * hooks, execution and store. Only `registerTool` is caught, so we get the definition instead of pi.
 */
export function stockCodemode(pi: ExtensionAPI): ToolDefinition<any, any, any> {
	const registered: ToolDefinition<any, any, any>[] = [];
	createCodemodeExtension()({ ...pi, registerTool: (tool: ToolDefinition<any, any, any>) => registered.push(tool) } as ExtensionAPI);
	if (registered.length !== 1 || registered[0].name !== "codemode") {
		throw new Error(`pi-minimal-tools: pi's codemode factory registered ${registered.map((t) => t.name).join(", ") || "nothing"}, expected one codemode tool`);
	}
	return registered[0];
}

/**
 * Stock codemode with a short call row: the dot, then the script cut like a bash command (2 lines,
 * 160 characters). The result (nested calls and output) and the expanded view (Ctrl+O) stay stock.
 */
export function shortCodemode<T extends ToolDefinition<any, any, any>>(stock: T): T {
	const stockCall = stock.renderCall!;
	const stockResult = stock.renderResult!;
	return {
		...stock,
		// No frame, like the bash and write rows (decision A30).
		renderShell: "self",
		renderCall: loud("codemode", (args, theme, ctx) => {
			const code: unknown = (args as { code?: unknown } | undefined)?.code;
			// Ctrl+O, and arguments stock flags as invalid: stock's drawing with the dot.
			if (ctx.expanded || (code !== undefined && typeof code !== "string")) {
				return dotInFront(stockCall(args, theme, { ...ctx, lastComponent: undefined }), rowState(ctx));
			}
			const title = theme.fg("toolTitle", theme.bold("codemode"));
			const script = typeof code === "string" && code.trim() ? highlightCode(shortCommand(code.replace(/\r/g, "").trimEnd()), "javascript").join("\n") : "";
			const header: Component = {
				// The script drawn 2 columns narrower and indented, so wrapped lines hang under it.
				render: (width) => [...new Text(title, 0, 0).render(width), ...(script ? new Text(script, 0, 0).render(width - 2).map((l) => `  ${l}`) : [])],
				invalidate() {},
			};
			return dotInFront(header, rowState(ctx));
		}),
		renderResult: loud("codemode", (result, options, theme, ctx) => stockResult(result, options, theme, { ...ctx, lastComponent: undefined })),
	};
}
