import type { ExtensionAPI, ToolRendererResolver, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import extension from "../index";
import { plain } from "./helpers/claude-code";
import { renderRow } from "./helpers/row";

function registration() {
	let resolve: ToolRendererResolver | undefined;
	const api = {
		registerMarkdownTransformer: vi.fn(),
		registerToolRenderer: vi.fn((resolver: ToolRendererResolver) => { resolve = resolver; }),
		registerTool: vi.fn(),
		setActiveTools: vi.fn(),
		getActiveTools: vi.fn(),
		getAllTools: vi.fn(),
		getSettings: vi.fn(),
		on: vi.fn(),
	};
	extension(api as unknown as ExtensionAPI);
	return { api, resolve: resolve! };
}

const names = ["bash", "write", "edit", "codemode", "grep", "find", "ls"];

describe("the entire extension is display-only", () => {
	it("registers one renderer resolver and markdown transformer, without tool or lifecycle ownership", () => {
		const { api } = registration();
		expect(api.registerToolRenderer).toHaveBeenCalledTimes(1);
		expect(api.registerMarkdownTransformer).toHaveBeenCalledTimes(1);
		for (const call of [api.registerTool, api.setActiveTools, api.getActiveTools, api.getAllTools, api.getSettings, api.on]) expect(call).not.toHaveBeenCalled();
	});

	it.each(names)("%s: wraps the next renderer only, with no execute/schema/activation fields", (name) => {
		const { resolve } = registration();
		const stock = {
			renderCall: vi.fn<NonNullable<ToolRenderers["renderCall"]>>((_args, _theme, ctx) => {
				expect(ctx.lastComponent).toBeUndefined();
				return new Text(`${name} downstream call`, 0, 0);
			}),
			renderResult: vi.fn<NonNullable<ToolRenderers["renderResult"]>>((_result, _options, _theme, ctx) => {
				expect(ctx.lastComponent).toBeUndefined();
				return new Text(`${name} downstream result`, 0, 0);
			}),
			// Even when next returns a full definition, the adapter returns rendering fields only.
			execute: vi.fn(),
			parameters: { type: "object" },
			defaultActive: false,
		};
		const next = vi.fn(() => stock);
		const renderers = resolve(name, next)!;
		expect(next).toHaveBeenCalledTimes(1);
		expect(Object.keys(renderers).sort()).toEqual(["renderCall", "renderResult", "renderShell"]);
		const row = renderRow({ definition: { name, ...renderers }, args: { command: "echo hi", path: "notes.txt", content: "hello", code: "return 1;" }, result: { text: "done" }, expanded: true });
		const text = plain(row).join("\n");
		expect(text).toContain(`${name} downstream call`);
		expect(text).toContain(`${name} downstream result`);
		expect(stock.execute).not.toHaveBeenCalled();
	});

	it.each(names)("%s: missing or partial custom drawing keeps pi's generic fallback unchanged", (name) => {
		const { resolve } = registration();
		expect(resolve(name, () => undefined)).toBeUndefined();
		for (const stock of [{}, { renderCall: () => new Text("custom call", 0, 0) }, { renderResult: () => new Text("custom result", 0, 0) }]) {
			expect(resolve(name, () => stock)).toBe(stock);
		}
	});

	it("execution-only custom codemode still shows its normal generic call and result, not a drawing failure", () => {
		const { resolve } = registration();
		const row = renderRow({ definition: { name: "codemode", ...resolve("codemode", () => ({})) }, args: { code: "return 42;" }, result: { text: "custom execution result" }, expanded: true });
		const text = plain(row).join("\n");
		expect(text).toContain("codemode");
		expect(text).toContain("custom execution result");
		expect(text).not.toContain("drawing the");
	});

	it.each(["read", "powershell", "mcp__bash", "toString"])("%s is outside our scope", (name) => {
		const stock = { renderCall: () => new Text("original", 0, 0), renderResult: () => new Text("result", 0, 0) };
		expect(registration().resolve(name, () => stock)).toBe(stock);
	});
});
