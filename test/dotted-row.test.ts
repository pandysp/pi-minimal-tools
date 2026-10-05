import { createEditToolDefinition, createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { DOT, GREEN, RED, GREY, plain } from "./helpers/claude-code";
import { describe, expect, it } from "vitest";
import { withDot } from "../dotted-row";
import { renderRow } from "./helpers/row";


const tools = {
	write: {
		definition: () => createWriteToolDefinition("/tmp"),
		args: { path: "notes.md", content: "hello\nworld" },
	},
	edit: {
		definition: () => createEditToolDefinition("/tmp"),
		args: { path: "notes.md", edits: [{ oldText: "hello", newText: "HELLO" }] },
	},
};

describe.each(Object.entries(tools))("%s rows: stock pi's drawing with Claude Code's dot in front", (_name, tool) => {
	const render = (result?: { text: string; isError?: boolean }) =>
		renderRow({ definition: { name: _name, ...withDot(_name, tool.definition()) }, args: tool.args, result });
	// Compared with stock's drawing without pi's frame, as our rows have none (decision A30).
	const stock = (result?: { text: string; isError?: boolean }) =>
		plain(renderRow({ definition: { ...tool.definition(), renderShell: "self" as const }, args: tool.args, result }));

	it.each([
		["running", undefined, GREY],
		["succeeded", { text: "Successfully wrote 11 bytes to notes.md" }, GREEN],
		["failed", { text: "Could not find the text to replace", isError: true }, RED],
	] as const)("%s: %s dot, otherwise identical to stock", (_state, result, colour) => {
		const lines = render(result);
		expect(lines.join("")).toContain(`${colour}${DOT}`);
		const ours = plain(lines);
		const theirs = stock(result);
		const first = theirs.findIndex((l) => l.trim() !== "");
		expect(ours[first].replace(`${DOT} `, "")).toBe(theirs[first]);
		expect(ours.filter((_, i) => i !== first)).toEqual(theirs.filter((_, i) => i !== first));
	});

	it("the dot sits directly before the tool name, keeping stock's indent", () => {
		const header = plain(render({ text: "done" })).find((l) => l.includes(DOT)) ?? "";
		expect(header).toMatch(new RegExp(`^\\s*${DOT} (write|edit) notes\\.md`));
		const stockHeader = stock({ text: "done" }).find((l) => /(write|edit) notes\.md/.test(l)) ?? "";
		expect(header.indexOf(DOT)).toBe(stockHeader.search(/\S/));
	});

	it("the dot never cuts off the file name, even in a narrow window", () => {
		const row = renderRow({ definition: { name: _name, ...withDot(_name, tool.definition()) }, args: { ...tool.args, path: "abcdefghijklm.txt" }, result: { text: "ok" }, width: 25 });
		expect(plain(row).join("\n")).toContain("abcdefghijklm.txt");
	});
});
