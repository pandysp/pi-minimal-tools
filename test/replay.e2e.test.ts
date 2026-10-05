import { describe, expect, it } from "vitest";
import { basename } from "node:path";
import { REPO, tempDir } from "./helpers/pi";
import { countedLines, replay, splitAtToolCalls } from "./helpers/replay";

// Real pi in tmux, waiting for the screen to settle: allow minutes, not vitest's default 5 seconds.
describe("replayed sessions in real pi with the user's full setup", { timeout: 300_000 }, () => {
	it("test C (3 bash commands + a read) takes at most 11 lines (same method, same run: stock pi 18; Claude Code measured 6)", async () => {
		const cwd = tempDir("test-c");
		const count = async (withExtension: boolean) => {
			const { tools } = splitAtToolCalls(await replay("session-bash-read.jsonl", withExtension, cwd, { presses: withExtension ? 1 : 0 }), "Then summarise in 2 sentences", "This Mac runs");
			return countedLines(tools);
		};
		const [stock, ours] = [await count(false), await count(true)];
		console.log(`test C: stock ${stock.length} lines, ours ${ours.length} lines\n${ours.join("\n")}`);
		expect(ours.length).toBeLessThanOrEqual(11);
	});

	it("header, prompt, reply and footer are unchanged, apart from our extension's name", async () => {
		// Same folder for both: it is shown in the footer.
		const cwd = tempDir("r72");
		// No Ctrl+O on either side: the text around the tool rows does not depend on the level.
		const parts = async (withExtension: boolean) =>
			splitAtToolCalls(await replay("session-mixed.jsonl", withExtension, cwd), "with one short sentence.", "I ran all nine");
		const [stock, ours] = [await parts(false), await parts(true)];
		// pi lists a loaded extension by its folder name.
		const name = basename(REPO).replace(/[.]/g, "\\.");
		const ourName = new RegExp(`, ${name}(?=,|$)|${name}, `);
		const expectedDifferences = (l: string) => l.replace(ourName, "");
		// Fullscreen pi fills the window with blank lines, whose number depends on how tall the tool rows are.
		const content = (lines: string[]) => lines.filter((l) => l.trim() !== "");
		expect(content(ours.before).map(expectedDifferences)).toEqual(content(stock.before));
		expect(content(ours.after).map(expectedDifferences)).toEqual(content(stock.after));
	});
});
