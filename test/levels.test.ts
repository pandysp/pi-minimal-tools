import { createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, type ExtensionAPI, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { bashFailed, claudeBash } from "../bash-row";
import { codemodeFailed, shortCodemode } from "../codemode-row";
import { withDot } from "../dotted-row";
import { hideable, watchLevels } from "../levels";
import { stockCodemode } from "./helpers/codemode";
import { plain } from "./helpers/claude-code";
import { liveRow } from "./helpers/row";

/** An interactive session as pi drives it: our input listener sees each key first, then pi handles it. */
function session({ expanded = false } = {}) {
	let start: ((event: unknown, ctx: unknown) => void) | undefined;
	let listener: ((data: string) => unknown) | undefined;
	let flag = expanded;
	const ui = {
		getToolsExpanded: () => flag,
		setToolsExpanded: vi.fn((value: boolean) => { flag = value; }),
		onTerminalInput: vi.fn((handler: (data: string) => unknown) => { listener = handler; return () => {}; }),
	};
	watchLevels({ on: (_event: string, handler: typeof start) => { start = handler; } } as unknown as ExtensionAPI);
	start!({ type: "session_start" }, { mode: "tui", ui });
	const afterKey = async (flips: boolean) => {
		listener!(flips ? "\x0f" : "a");
		if (flips) flag = !flag;
		await new Promise((resolve) => process.nextTick(resolve));
	};
	return { ui, ctrlO: () => afterKey(true), otherKey: () => afterKey(false), expanded: () => flag };
}

const custom: ToolRenderers & { name: string } = {
	name: "custom",
	renderCall: (args) => new Text(`custom ${JSON.stringify(args)}`, 0, 0),
	renderResult: (result) => new Text((result.content[0] as { text: string }).text, 0, 0),
};

/** A finished row drawn as pi would at the session's current flag. */
function finished(definition: ToolRenderers & { name: string }, args: Record<string, unknown>, result: { text: string; isError?: boolean; details?: unknown }, expanded = false) {
	const row = liveRow(definition, args);
	row.output(result.text, { isError: result.isError, details: result.details });
	row.expand(expanded);
	return row.render();
}
const wrapped = (definition: ToolRenderers & { name: string }, failed?: Parameters<typeof hideable>[1]) => ({ name: definition.name, ...hideable(definition, failed) });

describe("Ctrl+O cycles 1 → 2 → 3 → 1 on pi's own expanded flag", () => {
	it("a new interactive session starts at level 1; each flip is one step; 1 → 2 keeps pi collapsed", async () => {
		const pi = session();
		const success = () => finished(wrapped(custom), {}, { text: "done" }, pi.expanded());
		expect(success()).toEqual([]);
		await pi.ctrlO();
		expect(pi.ui.setToolsExpanded).toHaveBeenCalledWith(false);
		expect(pi.expanded()).toBe(false);
		expect(plain(success()).join("\n")).toContain("done");
		await pi.ctrlO();
		expect(pi.expanded()).toBe(true);
		await pi.ctrlO();
		expect(pi.expanded()).toBe(false);
		expect(success()).toEqual([]);
		expect(pi.ui.setToolsExpanded).toHaveBeenCalledTimes(1);
	});

	it("keys that leave pi's flag alone do not move the cycle", async () => {
		const pi = session();
		await pi.otherKey();
		await pi.otherKey();
		expect(finished(wrapped(custom), {}, { text: "done" })).toEqual([]);
		expect(pi.ui.setToolsExpanded).not.toHaveBeenCalled();
	});

	it("a session that starts expanded is at level 3, and its next step is level 1", async () => {
		const pi = session({ expanded: true });
		await pi.ctrlO();
		expect(finished(wrapped(custom), {}, { text: "done" })).toEqual([]);
	});

	it.each(["print", "rpc", "json"])("%s mode: no input listener and nothing hidden", async (mode) => {
		// A fresh copy of the module: the other tests here leave theirs at level 1.
		vi.resetModules();
		const fresh = await import("../levels");
		const onTerminalInput = vi.fn();
		let start: ((event: unknown, ctx: unknown) => void) | undefined;
		fresh.watchLevels({ on: (_event: string, handler: typeof start) => { start = handler; } } as unknown as ExtensionAPI);
		start!({ type: "session_start" }, { mode, ui: { onTerminalInput, getToolsExpanded: () => false } });
		expect(onTerminalInput).not.toHaveBeenCalled();
		expect(plain(finished({ name: "custom", ...fresh.hideable(custom) }, {}, { text: "done" })).join("\n")).toContain("done");
	});
});

describe("level 1 hides finished successes; running and failed rows stay", () => {
	it("a row is visible while running and streaming, and disappears once it succeeds", () => {
		session();
		const row = liveRow(wrapped(custom), { a: 1 });
		expect(plain(row.render()).join("\n")).toContain("custom");
		row.output("partial", { partial: true });
		expect(plain(row.render()).join("\n")).toContain("partial");
		row.output("done");
		expect(row.render()).toEqual([]);
	});

	it("a failed row stays in full", () => {
		session();
		expect(plain(finished(wrapped(custom), {}, { text: "boom", isError: true })).join("\n")).toContain("boom");
	});

	it("bash: a real failure stays; a grep that found nothing is a success and hides", () => {
		session();
		const bash = { name: "bash", ...hideable(claudeBash(createBashToolDefinition("/tmp")), bashFailed) };
		const bashRow = (command: string, text: string) => plain(finished(bash, { command }, { text, isError: true })).join("\n");
		expect(bashRow("cat missing.txt", "cat: missing.txt: No such file or directory\n\nCommand exited with code 1")).toContain("No such file");
		expect(bashRow("grep zzz sample.txt", "(no output)\n\nCommand exited with code 1")).toBe("");
	});

	it("codemode: a script that finished but had a failed call inside stays; a clean one hides", () => {
		session();
		const codemode = { name: "codemode", ...hideable(shortCodemode(stockCodemode()), codemodeFailed) };
		const details = (status: string) => ({ calls: [{ name: "read", args: '{"path":"x"}', status, durationMs: 1 }] });
		const run = (status: string) => plain(finished(codemode, { code: "return 1;" }, { text: "Script completed\nWall time 0.1 seconds\nOutput:\n1", details: details(status) })).join("\n");
		expect(run("error")).toContain("✗ read");
		expect(run("ok")).toBe("");
	});

	it("tools pi draws in its self shell (edit) hide as well", () => {
		session();
		const edit = { name: "edit", ...hideable(withDot("edit", createEditToolDefinition("/tmp"))) };
		expect(finished(edit, { path: "a.txt", edits: [{ oldText: "a", newText: "b" }] }, { text: "Successfully replaced 1 block(s) in a.txt." })).toEqual([]);
	});
});

describe("levels 2 and 3 draw exactly what pi draws without us", () => {
	const read = { name: "read", ...createReadToolDefinition("/tmp") };
	const edit = { name: "edit", ...createEditToolDefinition("/tmp") };
	const states: [string, (row: ReturnType<typeof liveRow>) => void][] = [
		["running", () => {}],
		["streaming", (row) => row.output("partial 1\npartial 2", { partial: true })],
		["succeeded", (row) => row.output(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"))],
		["failed", (row) => row.output("ENOENT: no such file", { isError: true })],
	];
	const cases: [string, ToolRenderers & { name: string }, Record<string, unknown>][] = [
		["read (pi's default shell, our copy of its frame)", read, { path: "notes.md" }],
		["custom tool with its own drawing (default shell)", custom, { a: 1 }],
		["edit (pi's self shell)", edit, { path: "a.txt", edits: [{ oldText: "a", newText: "b" }] }],
	];
	for (const [label, definition, args] of cases) {
		for (const [state, drive] of states) {
			for (const expanded of [false, true]) {
				it(`${label}, ${state}, level ${expanded ? 3 : 2}: identical, colours included`, async () => {
					const pi = session();
					await pi.ctrlO();
					if (expanded) await pi.ctrlO();
					const draw = (d: ToolRenderers & { name: string }) => {
						const row = liveRow(d, args);
						drive(row);
						row.expand(pi.expanded());
						return row.render(120);
					};
					expect(draw(wrapped(definition))).toEqual(draw(definition));
				});
			}
		}
	}
});

describe("third-party renderers that throw: pi's generic fallback, nothing lost or stale", () => {
	it("a call renderer that throws still shows the result", async () => {
		const pi = session();
		await pi.ctrlO();
		const broken = { ...custom, renderCall: () => { throw new Error("broken call renderer"); } };
		expect(plain(finished(wrapped(broken), { a: 1 }, { text: "final output" })).join("\n")).toContain("final output");
	});

	it("a result renderer that throws on the final result never shows the earlier partial result", async () => {
		const pi = session();
		await pi.ctrlO();
		const broken = {
			...custom,
			renderResult: (result: { content: { text?: string }[] }, options: { isPartial: boolean }) => {
				if (!options.isPartial) throw new Error("broken result renderer");
				return new Text(result.content[0].text ?? "", 0, 0);
			},
		} as ToolRenderers & { name: string };
		const row = liveRow(wrapped(broken), { a: 1 });
		row.output("partial output", { partial: true });
		row.output("final text");
		const text = plain(row.render()).join("\n");
		expect(text).not.toContain("partial output");
		expect(text).toContain("final text");
	});
});
