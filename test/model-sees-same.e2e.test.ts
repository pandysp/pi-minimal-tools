import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO, copySession, runPi, tempDir } from "./helpers/pi";

const FIXTURES = join(REPO, "test/fixtures");


// Two stock runs of the same resumed session were measured byte-identical (2026-09-26),
// so any difference below comes from the extension.
// Real pi calls the real model: allow minutes, not vitest's default 5 seconds.
describe("rule 1: the model is sent exactly what it would be sent without the extension", { timeout: 300_000 }, () => {
	it("a resumed session with bash and read history sends the identical request, codemode switched on", async () => {
		// codemode on explicitly, so its description and active state are part of the comparison.
		const cwd = tempDir("r71", { defaultTools: ["+codemode"] });
		const run = async (withExtension: boolean) =>
			(await runPi({ cwd, prompt: "Reply with just: ok", withExtension, session: copySession("session-bash-read.jsonl", cwd) })).requests;
		const [ext, stock] = [await run(true), await run(false)];
		expect(JSON.stringify(stock)).toContain('"codemode"');
		expect(ext).toEqual(stock);
	});

	it("dedicated grep/find/ls declarations and recorded results are identical with the tools enabled", async () => {
		const cwd = tempDir("look-tools", { defaultTools: ["+codemode", "+grep", "+find", "+ls"] });
		const run = async (withExtension: boolean) =>
			(await runPi({ cwd, prompt: "Reply with just: ok", withExtension, session: copySession("session-look.jsonl", cwd) })).requests;
		const [stock, ext] = [await run(false), await run(true)];
		for (const name of ["grep", "find", "ls"]) expect(JSON.stringify(stock)).toContain(`"name":"${name}"`);
		expect(ext).toEqual(stock);
	});

	it("switching tools off in settings stays respected (no tool gets switched back on)", async () => {
		// Same directory for both runs: its path is part of the system prompt.
		const cwd = tempDir("r74", { defaultTools: ["read"] });
		const run = async (withExtension: boolean) => (await runPi({ cwd, prompt: "Reply with just: ok", withExtension })).requests;
		const [stock, ext] = [await run(false), await run(true)];
		expect(ext).toEqual(stock);
	});

	it("built-in codemode switched off in settings stays off", async () => {
		const cwd = tempDir("no-codemode", { extensions: ["-builtin:codemode"], defaultTools: ["+codemode"] });
		const run = (withExtension: boolean) => runPi({ cwd, prompt: "Reply with just: ok", withExtension });
		const [stock, ext] = [await run(false), await run(true)];
		// The extension does not bring codemode back, not even as an inactive tool.
		expect(ext.codemode).toEqual(["none"]);
		expect(JSON.stringify(stock.requests)).not.toContain('"codemode"');
		expect(ext.requests).toEqual(stock.requests);
	});

	it("codemode scripts run their tools and keep stored values across calls, as without the extension", async () => {
		const prompt =
			'Use the codemode tool twice, one call after the other. First script: store("mark", 42); const r = await tools.bash({ command: "echo cm-$((6*7))" }); return r.output; Second script: return "stored=" + load("mark"); Then reply with just: done';
		for (const withExtension of [false, true]) {
			const cwd = tempDir(withExtension ? "cm-ext" : "cm-stock", { defaultTools: ["+codemode"] });
			const { requests } = await runPi({ cwd, prompt, withExtension });
			expect(JSON.stringify(requests.at(-1)), withExtension ? "extension" : "stock").toMatch(/cm-42.*stored=42/s);
		}
	});

	it("bash honours the user's shell, command prefix and session directory", async () => {
		const prompt =
			'Use the bash tool exactly once to run: echo "prefix=$PI_PREFIX_MARK shell=$PI_SHELL_MARK" && pwd -P . Then reply with just: done';
		const lastRequest = async (withExtension: boolean) => {
			const cwd = tempDir(withExtension ? "r73-ext" : "r73-stock", {
				shellCommandPrefix: "export PI_PREFIX_MARK=applied",
				shellPath: join(FIXTURES, "marking-shell.sh"),
			});
			const { requests } = await runPi({ cwd, prompt, withExtension });
			return { cwd, request: requests.at(-1) };
		};
		const stock = await lastRequest(false);
		const ext = await lastRequest(true);
		for (const [label, { cwd, request }] of [["stock", stock], ["extension", ext]] as const) {
			const text = JSON.stringify(request);
			expect(text, label).toContain("prefix=applied shell=applied");
			expect(text, label).toContain(cwd);
		}
	});

	it("a broken settings file: pi warns and carries on exactly as without the extension", async () => {
		// Same folder for both runs. Stock runs first with valid project settings (only switching off an
		// installed copy of this package); a broken file makes pi fall back to exactly those defaults.
		const cwd = tempDir("broken-settings");
		// All extensions still load, but this test isolates settings recovery from Hydra’s
		// background model calls/shutdown. The other tests retain the user’s active heads.
		const flags = ["--hydra-heads", "none"];
		const stock = await runPi({ cwd, prompt: "Reply with just: ok", withExtension: false, flags });
		writeFileSync(join(cwd, ".pi/settings.json"), "{ broken json");
		const ext = await runPi({ cwd, prompt: "Reply with just: ok", withExtension: true, flags });
		// Stock pi's own warning (measured for stock in decision A18) still appears with the extension.
		expect(ext.printed).toContain("Warning: Invalid settings file");
		expect(ext.requests).toEqual(stock.requests);
	});
});
