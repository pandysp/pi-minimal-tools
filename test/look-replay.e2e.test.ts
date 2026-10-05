import { describe, expect, it } from "vitest";
import { tempDir } from "./helpers/pi";
import { countedLines, replay, splitAtToolCalls } from "./helpers/replay";

const region = (screen: string[]) => splitAtToolCalls(screen, "Replay the dedicated read tools.", "Read-tool replay finished.").tools;

describe("dedicated read tools in real pi with the user's full setup", { timeout: 300_000 }, () => {
	it("the 202-line grep, find and ls collapse; truncation and full errors stay visible", async () => {
		const cwd = tempDir("look-replay", { defaultTools: ["+grep", "+find", "+ls"] });
		const stock = region(await replay("session-look.jsonl", false, cwd));
		const ours = region(await replay("session-look.jsonl", true, cwd, { presses: 1 }));
		const text = ours.join("\n");
		expect(text).toContain("Searched for 1 pattern (ctrl+o to expand)");
		expect(text).toContain("Listed 1 directory (ctrl+o to expand)");
		expect(text).toContain("[truncated] Searched for 1 pattern (ctrl+o to expand)");
		expect(text).not.toContain("capture evidence");
		expect(text).not.toContain("more lines");
		for (const name of ["grep", "find", "ls"]) expect(text).toContain(`${name} error detail 24`);
		expect(stock.join("\n")).toContain("capture evidence 1");
		expect(stock.join("\n")).toContain("more lines");
		console.log(`Dedicated read rows in real pi:\n${ours.filter((l) => /Searched|Listed|error detail 24/.test(l)).join("\n")}\nStock: ${countedLines(stock).length} visible lines; ours: ${countedLines(ours).length} (includes 75 lines of full errors).`);
	});

	it("Ctrl+O reveals the original call, last grep result and original limit notice", async () => {
		const cwd = tempDir("look-expanded", { defaultTools: ["+grep", "+find", "+ls"] });
		const stock = region(await replay("session-look.jsonl", false, cwd, { presses: 1, height: 600 }));
		const ours = region(await replay("session-look.jsonl", true, cwd, { presses: 2, height: 600 }));
		const text = ours.join("\n");
		expect(text).toContain("capture evidence 202");
		expect(text).toContain("capture-pane|Capture|clipboard|attach|control");
		expect(text).toContain("1 matches limit reached");
		expect(text).toContain("[Truncated: 1 matches limit]");
		expect(text).not.toContain("Searched for 1 pattern");
		// Our rows remove the stock frame; the full call/result text is otherwise stock.
		const content = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);
		expect(content(ours)).toEqual(content(stock));
		console.log(`Ctrl+O: ${ours.find((l) => l.includes("capture evidence 202"))?.trim()}; ${ours.find((l) => l.includes("[Truncated:"))?.trim()}`);
	});
});
