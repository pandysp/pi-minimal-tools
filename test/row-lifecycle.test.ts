import { createBashToolDefinition, createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { DOT, GREEN, GREY, plain } from "./helpers/claude-code";
import { describe, expect, it, vi } from "vitest";
import { claudeBash } from "../bash-row";
import { withDot } from "../dotted-row";
import { shortWrite } from "../write-row";
import { liveRow } from "./helpers/row";

const visible = (lines: string[]) => plain(lines).filter((l) => l.trim() !== "");
const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

// pi draws the same row component again and again: running, streaming, finished, Ctrl+O on and off.
describe("one row through its whole life, as pi drives it", () => {
	it("bash work command", () => {
		const row = liveRow(claudeBash(createBashToolDefinition("/tmp")), { command: "npm test" });
		expect(visible(row.render())).toEqual(["⏺ $ npm test", "  Running…"]);

		row.output(numbered(8), { partial: true });
		const streaming = row.render();
		expect(streaming.join("")).toContain(`${GREY}${DOT}`);
		expect(visible(streaming).join("\n")).toContain("line 8");
		expect(visible(streaming).join("\n")).not.toContain("Elapsed");
		row.expand(true);
		expect(visible(row.render()).join("\n")).toContain("line 8");
		row.expand(false);
		expect(row.render()).toEqual(streaming);

		row.output(numbered(20));
		const collapsed = visible(row.render());
		expect(collapsed).toEqual(["⏺ $ npm test", "  line 1", "  line 2", "  line 3", "  … +17 lines (ctrl+o to expand)"]);
		expect(row.render().join("")).toContain(`${GREEN}${DOT}`);

		row.expand(true);
		expect(visible(row.render()).join("\n")).toContain("line 20");
		row.expand(false);
		expect(visible(row.render())).toEqual(collapsed);
	});

	it("bash look-around command collapses to its summary line and comes back after Ctrl+O", () => {
		const row = liveRow(claudeBash(createBashToolDefinition("/tmp")), { command: "cat big.txt" });
		row.output(numbered(3), { partial: true });
		row.output(numbered(40));
		expect(visible(row.render())).toEqual(["  Read 1 file (ctrl+o to expand)"]);
		row.expand(true);
		expect(visible(row.render()).join("\n")).toContain("line 40");
		row.expand(false);
		expect(visible(row.render())).toEqual(["  Read 1 file (ctrl+o to expand)"]);
	});

	it("write: streaming content → done → Ctrl+O → back, with the dot grey → green", () => {
		const row = liveRow(shortWrite(createWriteToolDefinition("/tmp")), { path: "notes.md" }, { argsComplete: false });
		row.streamArgs({ path: "notes.md", content: numbered(2) });
		expect(visible(row.render())).toEqual([`${DOT} write notes.md`, "line 1", "line 2"]);
		row.streamArgs({ path: "notes.md", content: numbered(25) });
		const streaming = row.render();
		expect(visible(streaming)).toEqual([`${DOT} write notes.md`, "line 1", "line 2", "line 3", "… +22 lines (ctrl+o to expand)"]);
		expect(streaming.join("")).toContain(`${GREY}${DOT}`);

		row.completeArgs({ path: "notes.md", content: numbered(40) });
		row.output("Successfully wrote 40 lines to notes.md");
		const done = row.render();
		expect(visible(done)).toEqual([`${DOT} write notes.md`, "line 1", "line 2", "line 3", "… +37 lines (ctrl+o to expand)"]);
		expect(done.join("")).toContain(`${GREEN}${DOT}`);
		row.expand(true);
		const expanded = visible(row.render()).join("\n");
		expect(expanded).toContain("line 40");
		expect(expanded).not.toContain("… +37 lines");
		row.expand(false);
		expect(row.render()).toEqual(done);
	});

	it("write: redrawing the same row many times still shows exactly one dot (pi redraws constantly)", () => {
		const row = liveRow(withDot(createWriteToolDefinition("/tmp")), { path: "notes.md", content: "hello" });
		row.output("Successfully wrote 5 bytes to notes.md");
		for (let i = 0; i < 50; i++) row.render();
		const dots = plain(row.render()).join("\n").split(DOT).length - 1;
		expect(dots).toBe(1);
		expect(plain(row.render()).join("\n")).toContain(`${DOT} write notes.md`);
	});

	it("bash: finishing collapsed after Ctrl+O while streaming leaves no timer running", () => {
		vi.useFakeTimers();
		try {
			const row = liveRow(claudeBash(createBashToolDefinition("/tmp")), { command: "npm test" });
			row.output("line 1", { partial: true });
			row.expand(true);
			row.render();
			row.expand(false);
			row.output("line 1\nline 2");
			row.render();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
