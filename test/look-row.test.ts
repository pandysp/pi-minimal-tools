import {
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	type ExtensionAPI,
	type ToolRendererResolver,
} from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import extension from "../index";
import { LOOK_SUMMARY, shortLook } from "../look-row";
import { DOT, GREY, RED, plain } from "./helpers/claude-code";
import { liveRow, renderRow } from "./helpers/row";

const tools = {
	grep: { definition: () => createGrepToolDefinition("/tmp"), args: { pattern: "capture-pane|Capture|clipboard|attach|control", path: "am-tmux.go", limit: 25, context: 3 } },
	find: { definition: () => createFindToolDefinition("/tmp"), args: { pattern: "**/*.go", path: "/tmp" } },
	ls: { definition: () => createLsToolDefinition("/tmp"), args: { path: "/tmp" } },
};
const visible = (lines: string[]) => plain(lines).filter((l) => l.trim() !== "");
const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

describe.each(Object.entries(tools))("%s: dedicated look-around row", (name, tool) => {
	const key = name as keyof typeof tools;
	const definition = () => {
		const stock = tool.definition();
		return { ...stock, ...shortLook(key, stock) };
	};
	const summary = `  ${LOOK_SUMMARY[key]} (ctrl+o to expand)`;

	it("202 result lines collapse to one line; Ctrl+O shows stock's full view; collapsing restores it", () => {
		const row = liveRow(definition(), tool.args);
		row.output(numbered(202));
		expect(visible(row.render())).toEqual([summary]);
		row.expand(true);
		const stock = renderRow({ definition: { ...tool.definition(), renderShell: "self" }, args: tool.args, result: { text: numbered(202) }, expanded: true });
		expect(row.render()).toEqual(stock);
		expect(visible(row.render()).join("\n")).toContain("line 202");
		row.expand(false);
		for (let i = 0; i < 20; i++) expect(visible(row.render())).toEqual([summary]);
	});

	it.each(["No matches found", "(empty directory)", ""])("empty output is still a successful one-line call: %s", (text) => {
		expect(visible(renderRow({ definition: definition(), args: tool.args, result: { text } }))).toEqual([summary]);
	});

	it("argument streaming, running and partial results stay stock with a grey dot, then collapse", () => {
		const row = liveRow(definition(), {}, { argsComplete: false });
		expect(row.render().join("")).toContain(`${GREY}${DOT}`);
		row.streamArgs(tool.args);
		row.completeArgs(tool.args);
		row.output(numbered(30), { partial: true });
		expect(row.render().join("")).toContain(`${GREY}${DOT}`);
		expect(visible(row.render()).join("\n")).toContain("line 1");
		row.expand(true);
		expect(visible(row.render()).join("\n")).toContain("line 30");
		row.expand(false);
		row.output(numbered(30));
		expect(visible(row.render())).toEqual([summary]);
	});

	it("a failure has a red dot and its entire error, even past stock's collapsed preview", () => {
		const row = liveRow(definition(), tool.args);
		row.output(`Cannot access /missing\n${numbered(40)}`, { isError: true });
		expect(row.render().join("")).toContain(`${RED}${DOT}`);
		const text = visible(row.render()).join("\n");
		expect(text).toContain("Cannot access /missing");
		expect(text).toContain("line 40");
		expect(text).not.toContain("more lines");
		expect(text).not.toContain(LOOK_SUMMARY[key]);
		const collapsed = row.render();
		row.expand(true);
		expect(visible(row.render()).join("\n")).toContain("line 40");
		row.expand(false);
		expect(row.render()).toEqual(collapsed);
	});

	it("a next renderer using context.expanded also shows the whole error", () => {
		const custom = tool.definition();
		custom.renderResult = (_result, _options, _theme, ctx) => new Text(ctx.expanded ? numbered(40) : "error preview", 0, 0);
		const row = renderRow({ definition: { ...custom, ...shortLook(key, custom) }, args: tool.args, result: { text: numbered(40), isError: true } });
		expect(visible(row).join("\n")).toContain("line 40");
	});

	it.each([
		{ matchLimitReached: 25 },
		{ resultLimitReached: 1000 },
		{ entryLimitReached: 500 },
		{ truncation: { truncated: true, maxBytes: 50 * 1024 } },
		{ linesTruncated: true },
	])("limits stay visible in the one-line summary: %j", (details) => {
		expect(visible(renderRow({ definition: definition(), args: tool.args, result: { text: numbered(202), details } }))).toEqual([
			`  [truncated] ${LOOK_SUMMARY[key]} (ctrl+o to expand)`,
		]);
	});

	it("a narrow pane keeps the truncation warning ahead of the summary", () => {
		const lines = visible(renderRow({ definition: definition(), args: tool.args, result: { text: numbered(202), details: { truncation: { truncated: true } } }, width: 24 }));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("[truncated]");
	});

	it.each([1, 2, 10, 25, 40, 80])("the summary fits in one screen line at width %i", (width) => {
		const lines = visible(renderRow({ definition: definition(), args: tool.args, result: { text: numbered(202) }, width }));
		expect(lines.length).toBeLessThanOrEqual(1);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
	});

	it("drawing crashes stay loud, including crashes when the delegated component renders", () => {
		const stock = tool.definition();
		const broken = { ...stock, renderResult: () => ({ render() { throw new Error("stock drawing changed"); } }) };
		const row = renderRow({ definition: { ...stock, ...shortLook(key, broken) }, args: tool.args, result: { text: "done" }, expanded: true });
		expect(visible(row).join("\n")).toContain(`pi-minimal-tools: drawing the ${name} row failed: stock drawing changed`);
	});
});

describe("look-around registration is display-only", () => {
	it("registers a resolver, not replacement tools; unrelated and absent renderers pass through unchanged", () => {
		let resolve: ToolRendererResolver | undefined;
		const registerTool = vi.fn();
		const setActiveTools = vi.fn();
		extension({ on() {}, registerTool, setActiveTools, registerToolRenderer: (r: ToolRendererResolver) => { resolve = r; } } as unknown as ExtensionAPI);
		expect(resolve).toBeDefined();
		for (const name of ["read", "mcp__grep", "toString"]) {
			const stock = {};
			const next = vi.fn(() => stock);
			expect(resolve!(name, next)).toBe(stock);
			expect(next).toHaveBeenCalledTimes(1);
		}
		for (const [name, tool] of Object.entries(tools)) {
			const stock = tool.definition();
			const renderers = resolve!(name, () => stock)!;
			expect(renderers.renderShell).toBe("self");
			expect(renderers).not.toHaveProperty("execute");
			expect(resolve!(name, () => undefined)).toBeUndefined();
			const row = renderRow({ definition: { ...stock, ...renderers }, args: tool.args, result: { text: numbered(202) } });
			expect(visible(row)).toEqual([`  ${LOOK_SUMMARY[name as keyof typeof tools]} (ctrl+o to expand)`]);
		}
		expect(registerTool).not.toHaveBeenCalled();
		expect(setActiveTools).not.toHaveBeenCalled();
	});
});
