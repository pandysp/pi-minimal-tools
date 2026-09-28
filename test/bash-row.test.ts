import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { DOT, GREEN, RED, GREY, plain } from "./helpers/claude-code";
import { describe, expect, it } from "vitest";
import { claudeBash } from "../bash-row";
import { renderRow } from "./helpers/row";


const bash = () => claudeBash(createBashToolDefinition("/tmp"));
const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
const row = (command: string, result?: { text: string; isError?: boolean }, expanded = false) =>
	renderRow({ definition: bash(), args: { command }, result, expanded });
const visible = (lines: string[]) => plain(lines).filter((l) => l.trim() !== "");

describe("bash rows", () => {
	it("running, no output yet: grey dot, the command, and 'Running…'", () => {
		const lines = row("sleep 5");
		expect(visible(lines)).toEqual([`${DOT} $ sleep 5`, "  Running…"]);
		expect(lines.join("")).toContain(`${GREY}${DOT}`);
	});

	it("while the command is still being typed: '$ ...' like stock pi, not 'undefined'", () => {
		expect(visible(renderRow({ definition: bash(), args: {} }))).toEqual([`${DOT} $ ...`, "  Running…"]);
	});

	it("output started but still empty: keeps 'Running…'", () => {
		const lines = renderRow({ definition: bash(), args: { command: "sw_vers" }, result: { text: "" }, partial: true });
		expect(visible(lines)).toEqual([`${DOT} $ sw_vers`, "  Running…"]);
	});

	it("running with output: grey dot and stock pi's live tail of the latest lines", () => {
		const lines = renderRow({ definition: bash(), args: { command: "npm test" }, result: { text: numbered(30) }, partial: true });
		const text = visible(lines);
		expect(text[0]).toBe(`${DOT} $ npm test`);
		expect(text.join("\n")).toContain("line 30");
		expect(text.join("\n")).not.toContain("Running…");
		expect(lines.join("")).toContain(`${GREY}${DOT}`);
	});

	it("finished with 3 lines of output: green dot and all 3 lines, no 'Took' line", () => {
		const lines = row("sw_vers", { text: "ProductName: macOS\nProductVersion: 27.0\nBuildVersion: 26A428" });
		expect(visible(lines)).toEqual([`${DOT} $ sw_vers`, "  ProductName: macOS", "  ProductVersion: 27.0", "  BuildVersion: 26A428"]);
		expect(lines.join("")).toContain(`${GREEN}${DOT}`);
	});

	it("finished with 20 lines: the first 3, then '… +17 lines (ctrl+o to expand)'", () => {
		expect(visible(row("seq 1 20", { text: numbered(20) }))).toEqual([
			`${DOT} $ seq 1 20`,
			"  line 1",
			"  line 2",
			"  line 3",
			"  … +17 lines (ctrl+o to expand)",
		]);
	});

	it("failed: red dot and the first lines of what the command printed", () => {
		const lines = row("false", { text: "(no output)\n\nCommand exited with code 1", isError: true });
		expect(visible(lines)).toEqual([`${DOT} $ false`, "  (no output)", "  Command exited with code 1"]);
		expect(lines.join("")).toContain(`${RED}${DOT}`);
	});

	it.each([
		["ls -la", "Listed 1 directory (ctrl+o to expand)"],
		["cat sample.txt", "Read 1 file (ctrl+o to expand)"],
		["grep -n beta sample.txt", "Searched for 1 pattern (ctrl+o to expand)"],
	])("look-around %j, finished: one grey summary line, no dot", (command, summary) => {
		const lines = row(command, { text: numbered(40) });
		expect(visible(lines)).toEqual([`  ${summary}`]);
		expect(lines.join("")).not.toContain(DOT);
	});

	it("look-around while running: shown like any running command", () => {
		expect(visible(row("ls -la"))).toEqual([`${DOT} $ ls -la`, "  Running…"]);
	});

	it("look-around that failed: full row with red dot (Claude Code would hide it)", () => {
		const lines = row("cat missing.txt", { text: "cat: missing.txt: No such file or directory\n\nCommand exited with code 1", isError: true });
		expect(visible(lines)).toEqual([
			`${DOT} $ cat missing.txt`,
			"  cat: missing.txt: No such file or directory",
			"  Command exited with code 1",
		]);
		expect(lines.join("")).toContain(`${RED}${DOT}`);
	});

	it("grep/rg alone that found nothing (exit code 1, no output) is not a failure: one summary line", () => {
		for (const command of ["grep zzz sample.txt", "rg zzz"]) {
			const lines = row(command, { text: "(no output)\n\nCommand exited with code 1", isError: true });
			expect(visible(lines), command).toEqual(["  Searched for 1 pattern (ctrl+o to expand)"]);
		}
	});

	it("grep with a real error (exit code 2) stays a red full row", () => {
		const lines = row("grep x missing.txt", { text: "grep: missing.txt: No such file or directory\n\nCommand exited with code 2", isError: true });
		expect(visible(lines)[0]).toBe(`${DOT} $ grep x missing.txt`);
		expect(lines.join("")).toContain(`${RED}${DOT}`);
	});

	it("a multi-line script that ends in grep's exit code 1 is still a failure", () => {
		const lines = row("grep x /dev/null\nfalse", { text: "(no output)\n\nCommand exited with code 1", isError: true });
		expect(lines.join("")).toContain(`${RED}${DOT}`);
	});

	it.each([
		["seq 1 20", numbered(20)],
		["cat sample.txt", numbered(20)],
	])("Ctrl+O on %j: exactly stock pi's expanded row, drawn without pi's frame (decision A30)", (command, text) => {
		const frameless = { ...createBashToolDefinition("/tmp"), renderShell: "self" as const };
		const stock = renderRow({ definition: frameless, args: { command }, result: { text }, expanded: true });
		expect(plain(row(command, { text }, true))).toEqual(plain(stock));
	});

	it("three preview lines stay three screen lines, however long they are", () => {
		const long = "x".repeat(500);
		const lines = renderRow({ definition: bash(), args: { command: "npm test" }, result: { text: [long, long, long, long].join("\n") }, width: 40 });
		const text = visible(lines);
		expect(text).toHaveLength(1 + 3 + 1);
		expect(text.at(-1)).toContain("… +1 lines");
	});

	// Both shapes captured from Claude Code 2.1.283: `Bash(set -e; cd "$PWD"\n      python3 - <<'E'\u2026)` and a long
	// echo cut after 160 characters ("\u2026nnnnnnnnnn o\u2026") at 60 and 120 columns alike.
	it("a long script shows only its first 2 lines, then '\u2026', like Claude Code", () => {
		const script = `set -e; cd "$PWD"\npython3 - <<'E'\nprint('hi')\nE\nwc -l build.py`;
		expect(visible(row(script, { text: "hi" }))).toEqual([`${DOT} $ set -e; cd "$PWD"`, "  python3 - <<'E'\u2026", "  hi"]);
	});

	it("a long one-line command is cut after 160 characters; wrapped lines hang under the command", () => {
		const words = "abcdefghijklmnopqrstuvwxyz".split("").map((c) => c.repeat(10));
		const text = visible(renderRow({ definition: bash(), args: { command: `echo ${words.join(" ")}` }, result: { text: "ok" }, width: 60 }));
		const header = text.slice(0, -1);
		expect(header.join(" ").replace(/\s+/g, " ")).toBe(`${DOT} $ echo ${words.slice(0, 14).join(" ")} o\u2026`);
		for (const line of header.slice(1)) expect(line).toMatch(/^  \S/);
	});

	it("Ctrl+O still shows the whole command", () => {
		const script = "echo 1\necho 2\necho 3";
		expect(plain(row(script, { text: "1\n2\n3" }, true)).join("\n")).toContain("echo 3");
	});

	it("no frame around the row: at most one blank line (pi's spacing between rows), none inside", () => {
		for (const [command, text] of [["ls", "a\nb"], ["seq 1 5", "1\n2\n3\n4\n5"]]) {
			const lines = plain(row(command, { text }));
			expect(lines.filter((l) => l.trim() === "").length, command).toBeLessThanOrEqual(1);
			expect(lines.at(-1)?.trim(), command).not.toBe("");
		}
	});
});
