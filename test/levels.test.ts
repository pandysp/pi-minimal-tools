import { createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition, type ExtensionAPI, SessionManager, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { claudeBash } from "../bash-row";
import { shortCodemode } from "../codemode-row";
import { withDot } from "../dotted-row";
import { foldable } from "../groups";
import { hideable, watchLevels } from "../levels";
import { shortWrite } from "../write-row";
import { stockCodemode } from "./helpers/codemode";
import { plain, RED } from "./helpers/claude-code";
import { liveRow } from "./helpers/row";

/** pi's real in-memory session, filled the way pi saves a conversation. */
function chat() {
	const sm = SessionManager.inMemory("/tmp");
	const meta = { api: "anthropic-messages", provider: "anthropic", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: 0 };
	const save = (message: unknown) => sm.appendMessage(message as never);
	return {
		sm,
		user: (text: string) => save({ role: "user", content: text, timestamp: 0 }),
		/** One assistant message: optional thinking and text, then tool calls ([id, tool, args]). */
		assistant: (calls: [string, string, Record<string, unknown>][], { text = "", thinking = "" } = {}) =>
			save({
				role: "assistant",
				content: [
					...(thinking ? [{ type: "thinking", thinking }] : []),
					...(text ? [{ type: "text", text }] : []),
					...calls.map(([id, name, args]) => ({ type: "toolCall", id, name, arguments: args })),
				],
				stopReason: calls.length ? "toolUse" : "stop",
				...meta,
			}),
		result: (id: string, name: string, text: string, { isError = false, details = undefined as unknown } = {}) =>
			save({ role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text }], isError, details, timestamp: 0 }),
	};
}

/** An interactive session as pi drives it: our input listener sees each key first, then pi handles it. */
function session({ expanded = false, sm = chat().sm } = {}) {
	let start: ((event: unknown, ctx: unknown) => void) | undefined;
	let listener: ((data: string) => unknown) | undefined;
	let flag = expanded;
	const ui = {
		getToolsExpanded: () => flag,
		setToolsExpanded: vi.fn((value: boolean) => { flag = value; }),
		onTerminalInput: vi.fn((handler: (data: string) => unknown) => { listener = handler; return () => {}; }),
	};
	watchLevels({ on: (_event: string, handler: typeof start) => { start = handler; } } as unknown as ExtensionAPI);
	start!({ type: "session_start" }, { mode: "tui", ui, sessionManager: sm });
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
const definitions: Record<string, ToolRenderers & { name: string }> = {
	custom,
	bash: { name: "bash", ...claudeBash(createBashToolDefinition("/tmp")) },
	read: { name: "read", ...createReadToolDefinition("/tmp") },
	write: { name: "write", ...shortWrite(createWriteToolDefinition("/tmp")) },
	edit: { name: "edit", ...withDot("edit", createEditToolDefinition("/tmp")) },
	codemode: { name: "codemode", ...shortCodemode(stockCodemode()) },
};
for (const name of Object.keys(definitions)) foldable.add(name);

const wrapped = (definition: ToolRenderers & { name: string }) => ({ name: definition.name, ...hideable(definition) });

/** A row as pi draws it, given its saved outcome (or none: still running). Plain text, blank lines dropped. */
function row(id: string, tool: string, args: Record<string, unknown>, result?: { text: string; isError?: boolean; details?: unknown }, expanded = false) {
	const r = liveRow(wrapped(definitions[tool]), args, { id });
	if (result) r.output(result.text, { isError: result.isError, details: result.details });
	r.expand(expanded);
	return plain(r.render(160)).filter((l) => l.trim());
}

/** A conversation with one group: bash ok, bash failed, read, write, edit, custom. */
function oneGroup() {
	const c = chat();
	c.user("go");
	const calls: [string, string, Record<string, unknown>, { text: string; isError?: boolean }][] = [
		["b1", "bash", { command: "ls" }, { text: "a.txt" }],
		["b2", "bash", { command: "cat missing.txt" }, { text: "cat: missing.txt: No such file or directory\n\nCommand exited with code 1", isError: true }],
		["r1", "read", { path: "a.txt" }, { text: "alpha" }],
		["w1", "write", { path: "b.txt", content: "x" }, { text: "Successfully wrote 1 bytes to b.txt" }],
		["e1", "edit", { path: "b.txt", edits: [{ oldText: "x", newText: "y" }] }, { text: "Successfully replaced 1 block(s) in b.txt." }],
		["x1", "custom", { a: 1 }, { text: "done" }],
	];
	for (const [id, tool, args, result] of calls) {
		c.assistant([[id, tool, args]]);
		c.result(id, tool, result.text, { isError: result.isError });
	}
	return { c, calls };
}

describe("Ctrl+O cycles 1 → 2 → 3 → 1 on pi's own expanded flag", () => {
	it("a new interactive session starts at level 1; each flip is one step; 1 → 2 keeps pi collapsed", async () => {
		const c = chat();
		c.assistant([["x1", "custom", {}]]);
		c.result("x1", "custom", "done");
		const pi = session({ sm: c.sm });
		const draw = () => row("x1", "custom", {}, { text: "done" }, pi.expanded()).join("\n");
		expect(draw()).toBe("⏺ 1 action (ctrl+o to expand)");
		await pi.ctrlO();
		expect(pi.ui.setToolsExpanded).toHaveBeenCalledWith(false);
		expect(pi.expanded()).toBe(false);
		expect(draw()).toContain("done");
		await pi.ctrlO();
		expect(pi.expanded()).toBe(true);
		await pi.ctrlO();
		expect(pi.expanded()).toBe(false);
		expect(draw()).toBe("⏺ 1 action (ctrl+o to expand)");
		expect(pi.ui.setToolsExpanded).toHaveBeenCalledTimes(1);
	});

	it("keys that leave pi's flag alone do not move the cycle", async () => {
		const c = chat();
		c.assistant([["x1", "custom", {}]]);
		c.result("x1", "custom", "done");
		const pi = session({ sm: c.sm });
		await pi.otherKey();
		await pi.otherKey();
		expect(row("x1", "custom", {}, { text: "done" })).toEqual(["⏺ 1 action (ctrl+o to expand)"]);
		expect(pi.ui.setToolsExpanded).not.toHaveBeenCalled();
	});

	it("a session that starts expanded is at level 3, and its next step is level 1", async () => {
		const c = chat();
		c.assistant([["x1", "custom", {}]]);
		c.result("x1", "custom", "done");
		const pi = session({ expanded: true, sm: c.sm });
		await pi.ctrlO();
		expect(row("x1", "custom", {}, { text: "done" })).toEqual(["⏺ 1 action (ctrl+o to expand)"]);
	});

	it.each(["print", "rpc", "json"])("%s mode: no input listener and nothing folded", async (mode) => {
		// A fresh copy of the module: the other tests here leave theirs at level 1.
		vi.resetModules();
		const fresh = await import("../levels");
		const c = chat();
		c.assistant([["x1", "custom", {}]]);
		c.result("x1", "custom", "done");
		const onTerminalInput = vi.fn();
		let start: ((event: unknown, ctx: unknown) => void) | undefined;
		fresh.watchLevels({ on: (_event: string, handler: typeof start) => { start = handler; } } as unknown as ExtensionAPI);
		start!({ type: "session_start" }, { mode, ui: { onTerminalInput, getToolsExpanded: () => false }, sessionManager: c.sm });
		expect(onTerminalInput).not.toHaveBeenCalled();
		const r = liveRow({ name: "custom", ...fresh.hideable(custom) }, {}, { id: "x1" });
		r.output("done");
		expect(plain(r.render()).join("\n")).toContain("done");
	});
});

describe("level 1: one summary line per group", () => {
	it("the group's first finished call draws the summary in a fixed order with failures per kind; the others draw nothing", () => {
		const { c, calls } = oneGroup();
		session({ sm: c.sm });
		const drawn = calls.map(([id, tool, args, result]) => row(id, tool, args, result));
		expect(drawn[0]).toEqual(["⏺ Ran 2 commands (1 failed), created 1 file, read 1 file, edited 1 file, and 1 more action (ctrl+o to expand)"]);
		for (const lines of drawn.slice(1)) expect(lines).toEqual([]);
	});

	it("the dot is red when a call failed, green otherwise", () => {
		const { c, calls } = oneGroup();
		session({ sm: c.sm });
		const [id, tool, args, result] = calls[0];
		const r = liveRow(wrapped(definitions[tool]), args, { id });
		r.output(result.text);
		expect(r.render(160).join("")).toContain(RED);
	});

	it("your messages and the agent's text end a group; its thinking does not", () => {
		const c = chat();
		c.user("go");
		c.assistant([["b1", "bash", { command: "ls" }]]);
		c.result("b1", "bash", "a.txt");
		c.assistant([["b2", "bash", { command: "pwd" }]], { thinking: "next: where am I" });
		c.result("b2", "bash", "/tmp");
		c.assistant([["b3", "bash", { command: "date" }]], { text: "Now the date." });
		c.result("b3", "bash", "today");
		c.user("again");
		c.assistant([["b4", "bash", { command: "whoami" }]]);
		c.result("b4", "bash", "me");
		session({ sm: c.sm });
		expect(row("b1", "bash", { command: "ls" }, { text: "a.txt" })).toEqual(["⏺ Ran 2 commands (ctrl+o to expand)"]);
		expect(row("b2", "bash", { command: "pwd" }, { text: "/tmp" })).toEqual([]);
		expect(row("b3", "bash", { command: "date" }, { text: "today" })).toEqual(["⏺ Ran 1 command (ctrl+o to expand)"]);
		expect(row("b4", "bash", { command: "whoami" }, { text: "me" })).toEqual(["⏺ Ran 1 command (ctrl+o to expand)"]);
	});

	it("an extension message ends a group only when pi shows it", () => {
		const c = chat();
		c.assistant([["b1", "bash", { command: "ls" }]]);
		c.result("b1", "bash", "a.txt");
		c.sm.appendCustomMessageEntry("note", "hidden context", false);
		c.assistant([["b2", "bash", { command: "pwd" }]]);
		c.result("b2", "bash", "/tmp");
		c.sm.appendCustomMessageEntry("note", "shown note", true);
		c.assistant([["b3", "bash", { command: "date" }]]);
		c.result("b3", "bash", "today");
		session({ sm: c.sm });
		expect(row("b1", "bash", { command: "ls" }, { text: "a.txt" })).toEqual(["⏺ Ran 2 commands (ctrl+o to expand)"]);
		expect(row("b2", "bash", { command: "pwd" }, { text: "/tmp" })).toEqual([]);
		expect(row("b3", "bash", { command: "date" }, { text: "today" })).toEqual(["⏺ Ran 1 command (ctrl+o to expand)"]);
	});

	it("a tool without drawing code of its own ends the group and is not counted", () => {
		const c = chat();
		c.assistant([["b1", "bash", { command: "ls" }]]);
		c.result("b1", "bash", "a.txt");
		c.assistant([["p1", "plain_tool", {}]]);
		c.result("p1", "plain_tool", "plain");
		c.assistant([["b2", "bash", { command: "pwd" }]]);
		c.result("b2", "bash", "/tmp");
		session({ sm: c.sm });
		expect(row("b1", "bash", { command: "ls" }, { text: "a.txt" })).toEqual(["⏺ Ran 1 command (ctrl+o to expand)"]);
		expect(row("b2", "bash", { command: "pwd" }, { text: "/tmp" })).toEqual(["⏺ Ran 1 command (ctrl+o to expand)"]);
	});

	it("a running call draws its normal row and is not counted yet; a call not saved yet draws its normal row", () => {
		const c = chat();
		c.assistant([["b1", "bash", { command: "ls" }]]);
		c.result("b1", "bash", "a.txt");
		c.assistant([["b2", "bash", { command: "sleep 8" }]]);
		session({ sm: c.sm });
		expect(row("b1", "bash", { command: "ls" }, { text: "a.txt" })).toEqual(["⏺ Ran 1 command (ctrl+o to expand)"]);
		expect(row("b2", "bash", { command: "sleep 8" }).join("\n")).toContain("$ sleep 8");
		expect(row("unsaved", "bash", { command: "echo hi" }).join("\n")).toContain("$ echo hi");
	});

	it("failure rules follow the rows: a grep that found nothing succeeded; a codemode script with a failed call inside failed", () => {
		const c = chat();
		c.assistant([["g1", "bash", { command: "grep zzz notes.txt" }]]);
		c.result("g1", "bash", "(no output)\n\nCommand exited with code 1", { isError: true });
		c.assistant([["m1", "codemode", { code: "return 1;" }]]);
		c.result("m1", "codemode", "Script completed\nWall time 0.1 seconds\nOutput:\n1", { details: { calls: [{ name: "read", args: "{}", status: "error", durationMs: 1 }] } });
		session({ sm: c.sm });
		expect(row("g1", "bash", { command: "grep zzz notes.txt" }, { text: "(no output)\n\nCommand exited with code 1", isError: true })).toEqual([
			"⏺ Ran 1 command, and 1 more action (1 failed) (ctrl+o to expand)",
		]);
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

/** A finished row drawn as pi would. */
function finished(definition: ToolRenderers & { name: string }, args: Record<string, unknown>, result: { text: string; isError?: boolean; details?: unknown }) {
	const r = liveRow(definition, args);
	r.output(result.text, { isError: result.isError, details: result.details });
	return r.render();
}

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
