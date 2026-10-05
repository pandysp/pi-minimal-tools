import { describe, expect, it } from "vitest";
import { tempDir } from "./helpers/pi";
import { replay, splitAtToolCalls } from "./helpers/replay";

const tools = (screen: string[]) => splitAtToolCalls(screen, "Replay the levels proof.", "Levels replay finished.").tools;

describe("Ctrl+O levels in real pi with the user's full setup", { timeout: 300_000 }, () => {
	it("starts at level 1 with one summary line for the four calls; Ctrl+O shows the rows", async () => {
		const cwd = tempDir("levels");
		const level1 = tools(await replay("session-levels.jsonl", true, cwd));
		// The prompt's spacing, the summary line, the reply's spacing, and nothing else: hidden rows leave no blank line.
		expect(level1.map((l) => l.trimEnd())).toEqual(["", "", "⏺ Ran 3 commands (2 failed), read 1 file (ctrl+o to expand)", ""]);

		const level2 = tools(await replay("session-levels.jsonl", true, cwd, { presses: 1 })).join("\n");
		for (const row of ["$ ./first-check.sh", "read notes.md", "second failure", "hidden-success"]) expect(level2).toContain(row);
		expect(level2).not.toContain("Ran 3 commands");
	});
});
