import { createCodemodeExtension, type ExtensionAPI, type ToolDefinition } from "@earendil-works/pi-coding-agent";

/** Stock drawing for tests only; production wraps the live codemode renderer through next(). */
export function stockCodemode(): ToolDefinition<any, any, any> {
	let stock: ToolDefinition<any, any, any> | undefined;
	createCodemodeExtension()({ registerTool: (tool) => { stock = tool; } } as ExtensionAPI);
	if (!stock || stock.name !== "codemode") throw new Error("expected pi’s own codemode definition");
	return stock;
}
