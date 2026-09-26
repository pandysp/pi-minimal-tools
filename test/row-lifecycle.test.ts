import { createBashToolDefinition, createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { DOT, GREEN, GREY, plain } from "./helpers/claude-code";
import { describe, expect, it, vi } from "vitest";
import { claudeBash } from "../bash-row";
import { withDot } from "../dotted-row";
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

	it("write: dot goes grey → green and survives Ctrl+O on and off", () => {
		const row = liveRow(withDot(createWriteToolDefinition("/tmp")), { path: "notes.md", content: "hello\nworld" });
		expect(row.render().join("")).toContain(`${GREY}${DOT}`);
		row.output("Successfully wrote 11 bytes to notes.md");
		const done = row.render();
		expect(done.join("")).toContain(`${GREEN}${DOT}`);
		row.expand(true);
		expect(row.render().join("")).toContain(`${GREEN}${DOT}`);
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
