import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { tempDir } from "./helpers/pi";
import { replay, splitAtToolCalls } from "./helpers/replay";

const tools = (screen: string[]) => splitAtToolCalls(screen, "Replay the levels proof.", "Levels replay finished.").tools.join("\n");

describe("Ctrl+O levels in real pi with the user's full setup", { timeout: 300_000 }, () => {
	it("starts at level 1 with only the failures; Ctrl+O shows level 2 without a frame of level 3 in between", async () => {
		const cwd = tempDir("levels");
		const level1 = tools(await replay("session-levels.jsonl", true, cwd));
		expect(level1).toContain("$ ./first-check.sh");
		expect(level1).toContain("second failure");
		expect(level1).not.toContain("read notes.md");
		expect(level1).not.toContain("hidden-success");
		// The hidden read sits between the two failures. A hidden row that kept pi's blank line would show as a gap.
		expect(level1.trim().replace(/[ \t]+$/gm, "")).not.toMatch(/\n\n\n/);

		const recording = join(cwd, "level-1-to-2.raw");
		const level2 = tools(await replay("session-levels.jsonl", true, cwd, { presses: 1, recording }));
		expect(level2).toContain("read notes.md");
		expect(level2).toContain("hidden-success");
		// Collapsed, the first failure shows 3 of its 10 lines; only the expanded view (level 3) draws line 10.
		expect(level2).not.toContain("first failure line 10");
		expect(stripTerminalSequences(readFileSync(recording, "utf8"))).not.toContain("first failure line 10");
		console.log(`Level 1 in real pi:\n${level1.split("\n").filter((l) => l.trim()).join("\n")}`);
	});
});
