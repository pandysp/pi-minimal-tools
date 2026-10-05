import { describe, expect, it } from "vitest";
import { tempDir } from "./helpers/pi";
import { replay, splitAtToolCalls } from "./helpers/replay";

const tools = (screen: string[]) => splitAtToolCalls(screen, "Replay the levels proof.", "Levels replay finished.").tools;

describe("Ctrl+O levels in real pi with the user's full setup", { timeout: 300_000 }, () => {
	it("starts at level 1 with one summary line for the four calls; Ctrl+O shows the rows", async () => {
		const cwd = tempDir("levels");
		const level1 = tools(await replay("session-levels.jsonl", true, cwd));
		// The prompt's spacing, the summary line, the reply's spacing, and nothing else: hidden rows and the
		// "Thinking..." of messages that went on leave no blank line.
		const summary = ["", "", "▸ Ran 3 commands (2 failed), read 1 file (ctrl+o to expand)", ""];
		expect(level1.map((l) => l.trimEnd())).toEqual(summary);

		const level2 = tools(await replay("session-levels.jsonl", true, cwd, { presses: 1 })).join("\n");
		for (const row of ["$ ./first-check.sh", "read notes.md", "second failure", "hidden-success"]) expect(level2).toContain(row);
		expect(level2).not.toContain("Ran 3 commands");
		expect(level2.match(/Thinking\.\.\./g)).toHaveLength(3);

		// Through level 3 back to 1: the thinking hides again.
		expect(tools(await replay("session-levels.jsonl", true, cwd, { presses: 3 })).map((l) => l.trimEnd())).toEqual(summary);
	});

	it("a click on the summary line opens the group at level 1: the summary stays on top, the rows show below", async () => {
		const cwd = tempDir("levels-click");
		const opened = tools(await replay("session-levels.jsonl", true, cwd, { click: "Ran 3 commands" })).join("\n");
		expect(opened).toContain("▾ Ran 3 commands (2 failed), read 1 file (ctrl+o to expand)");
		for (const row of ["$ ./first-check.sh", "read notes.md", "second failure", "hidden-success"]) expect(opened).toContain(row);
		// Collapsed rows, as at level 2: the first failure shows 3 of its 10 lines.
		expect(opened).not.toContain("first failure line 10");
	});
});
