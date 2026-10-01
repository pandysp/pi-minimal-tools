import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { shortCodemode, stockCodemode } from "../codemode-row";
import { DOT, GREEN, GREY, RED, plain } from "./helpers/claude-code";
import { renderRow } from "./helpers/row";

// The factory only registers the tool; the API methods it hands the tool are not called while drawing.
const stock = () => stockCodemode({} as ExtensionAPI);
const SCRIPT = [
	"const r = await Promise.allSettled([",
	'  tools.bash({ command: "git status" }),',
	'  tools.read({ path: "README.md" }),',
	"]);",
	"return r.map((x) => x.status);",
].join("\n");
const DONE = {
	text: "Script completed\nWall time 0.1 seconds\nOutput:\n",
	details: {
		calls: [
			{ name: "bash", args: '{"command":"git status"}', status: "ok", durationMs: 45 },
			{ name: "read", args: '{"path":"README.md"}', status: "ok", durationMs: 4 },
		],
	},
};
const row = (args: Record<string, unknown>, result?: { text: string; isError?: boolean; details?: unknown }, opts: { partial?: boolean; expanded?: boolean; width?: number } = {}) =>
	renderRow({ definition: shortCodemode(stock()), args, result, ...opts });
const visible = (lines: string[]) => plain(lines).filter((l) => l.trim() !== "");

describe("codemode rows", () => {
	it("the script is cut like a bash command: first 2 lines, then '…'", () => {
		const lines = visible(row({ code: SCRIPT }, DONE));
		expect(lines.slice(0, 3)).toEqual([`${DOT} codemode`, "  const r = await Promise.allSettled([", '    tools.bash({ command: "git status" }),…']);
	});

	it.each([
		["running", undefined, true, GREY],
		["succeeded", DONE, false, GREEN],
		["failed", { ...DONE, text: "Script failed\nWall time 0.1 seconds\nOutput:\n", isError: true }, false, RED],
	] as const)("%s: %s dot", (_state, result, partial, colour) => {
		expect(row({ code: "return 1;" }, result, { partial }).join("")).toContain(`${colour}${DOT}`);
	});

	it("while the model is still typing the script: just the dot and 'codemode'", () => {
		expect(visible(row({}))).toEqual([`${DOT} codemode`]);
	});

	it("the result part (nested calls, output) is stock pi's drawing", () => {
		const ours = visible(row({ code: "return 1;" }, DONE));
		const theirs = visible(renderRow({ definition: { ...stock(), renderShell: "self" as const }, args: { code: "return 1;" }, result: DONE }));
		// Stock: title, script line, then the result. Ours: the same after the header and script line.
		expect(ours.slice(2)).toEqual(theirs.slice(2));
		expect(ours.slice(2)[0]).toMatch(/^✓ bash \{"command":"git status"\}/);
	});

	it("Ctrl+O shows stock pi's full script, with the dot", () => {
		const ours = visible(row({ code: SCRIPT }, DONE, { expanded: true }));
		const theirs = visible(renderRow({ definition: { ...stock(), renderShell: "self" as const }, args: { code: SCRIPT }, result: DONE, expanded: true }));
		expect(ours[0]).toBe(`${DOT} codemode`);
		expect(ours.slice(1)).toEqual(theirs.slice(1));
		expect(ours.join("\n")).toContain("return r.map((x) => x.status);");
	});

	it("arguments stock rejects still show stock's '[invalid arg]'", () => {
		expect(visible(row({ code: 42 }))[0]).toBe(`${DOT} codemode [invalid arg]`);
	});

	it("a wrapped script line hangs under the script, not under the dot", () => {
		const lines = visible(row({ code: SCRIPT }, DONE, { width: 30 }));
		const script = lines.slice(1, lines.findIndex((l) => l.startsWith("✓")));
		expect(script.length).toBeGreaterThan(2);
		for (const l of script) expect(l).toMatch(/^  /);
	});

	it("the script never runs past the window, even when narrow", () => {
		const lines = plain(row({ code: SCRIPT }, DONE, { width: 30 }));
		expect(lines.every((l) => l.length <= 30)).toBe(true);
	});
});
