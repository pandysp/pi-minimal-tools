import { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { withDot } from "../dotted-row";
import { shortWrite } from "../write-row";
import { DOT, GREEN, RED, plain } from "./helpers/claude-code";
import { renderRow } from "./helpers/row";

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
const row = (content: unknown, result?: { text: string; isError?: boolean }, expanded = false, path = "notes.txt") =>
	renderRow({ definition: { name: "write", ...shortWrite(createWriteToolDefinition("/tmp")) }, args: { path, content }, result, expanded });
const visible = (lines: string[]) => plain(lines).filter((l) => l.trim() !== "");
const WROTE = { text: "Successfully wrote 40 bytes to notes.txt" };

describe("write rows", () => {
	it("long content: the first 3 lines, then '… +N lines' like a bash row", () => {
		const lines = row(numbered(40), WROTE);
		expect(visible(lines)).toEqual([`${DOT} write notes.txt`, "line 1", "line 2", "line 3", "… +37 lines (ctrl+o to expand)"]);
		expect(lines.join("")).toContain(`${GREEN}${DOT}`);
	});

	it("short content: exactly stock's row with the dot", () => {
		const ours = row("a\nb\nc", WROTE);
		const theirs = renderRow({ definition: { name: "write", ...withDot("write", createWriteToolDefinition("/tmp")) }, args: { path: "notes.txt", content: "a\nb\nc" }, result: WROTE });
		expect(ours).toEqual(theirs);
	});

	it("trailing empty lines are not counted, as in stock", () => {
		expect(visible(row(`${numbered(5)}\n\n\n`, WROTE)).at(-1)).toBe("… +2 lines (ctrl+o to expand)");
	});

	it("Ctrl+O shows stock's full content", () => {
		const text = visible(row(numbered(40), WROTE, true)).join("\n");
		expect(text).toContain("line 10");
		expect(text).not.toContain("… +37 lines");
	});

	it("a failed write: red dot, stock's row (more of the content) and stock's error text", () => {
		const failed = { text: "EACCES: permission denied", isError: true };
		const lines = row(numbered(40), failed);
		expect(lines.join("")).toContain(`${RED}${DOT}`);
		const text = visible(lines);
		expect(text).toContain("line 10");
		expect(text).toContain("EACCES: permission denied");
		expect(text.join("\n")).not.toContain("… +37 lines");
	});

	it("content stock rejects still shows stock's error", () => {
		expect(visible(row(42)).join("\n")).toContain("[invalid content arg - expected string]");
	});
});
