import { describe, expect, it } from "vitest";
import { replay, splitAtToolCalls } from "./helpers/replay";
import { tempDir } from "./helpers/pi";

const region = (screen: string[]) => splitAtToolCalls(screen, "Replay the codemode rendering proof.", "Codemode replay finished.").tools;

describe("codemode renderer in real pi with the user’s full setup", { timeout: 300_000 }, () => {
	it("a short script preview, stock nested calls/result, then full script on Ctrl+O", async () => {
		const cwd = tempDir("codemode-replay", { defaultTools: ["+codemode"] });
		const collapsed = region(await replay("session-codemode.jsonl", true, cwd)).join("\n");
		expect(collapsed).toContain("⏺ codemode");
		expect(collapsed).toContain('const first = await tools.bash');
		expect(collapsed).toContain('const second = await tools.read');
		expect(collapsed).not.toContain('store("mark", 42)');
		expect(collapsed).toContain('✓ bash {"command":"echo renderer-proof"}');
		expect(collapsed).toContain("codemode result proof");
		const expanded = region(await replay("session-codemode.jsonl", true, cwd, { expanded: true })).join("\n");
		expect(expanded).toContain('store("mark", 42)');
		expect(expanded).toContain('return "codemode last script line";');
		console.log(`Real pi: short codemode script + stock nested calls/output; Ctrl+O reveals the final script line.`);
	});
});
