import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterAll } from "vitest";

export const REPO = resolve(import.meta.dirname, "../..");
export const EXTENSION = join(REPO, "index.ts");
export const CAPTURE_EXTENSION = join(REPO, "test/fixtures/capture-payloads.ts");

/**
 * This checkout and, when testing from a git worktree, the main checkout, which the user may have
 * installed. UI tests prove the selected renderers load; request tests require stock tool identities.
 */
const CHECKOUTS = [
	...new Set([REPO, dirname(resolve(REPO, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: REPO, encoding: "utf8" }).trim()))]),
];

/** All test folders of a test file live here and are removed after it (vitest workers skip "exit" handlers). */
const TEMP_ROOT = realpathSync(mkdtempSync(join(tmpdir(), "pi-minimal-tools-")));
afterAll(() => rmSync(TEMP_ROOT, { recursive: true, force: true }));

/**
 * A fresh project directory for pi runs. Its project settings switch off any installed copy of this
 * package, so a run without `-e EXTENSION` really is stock pi, whether or not the user installed it.
 */
export function tempDir(prefix: string, settings: object = {}): string {
	const dir = mkdtempSync(join(TEMP_ROOT, `${prefix}-`));
	mkdirSync(join(dir, ".pi"));
	const packages = CHECKOUTS.map((source) => ({ source, extensions: [] }));
	writeFileSync(join(dir, ".pi/settings.json"), JSON.stringify({ ...settings, packages }));
	return dir;
}

/**
 * Copy a fixture session into `dir` and make `dir` its working directory: pi resumes a session in the
 * folder it was recorded in and loads that folder's project settings.
 */
export function copySession(fixture: string, dir: string): string {
	const target = join(dir, "session.jsonl");
	const [header, ...rest] = readFileSync(join(REPO, "test/fixtures", fixture), "utf8").split("\n");
	writeFileSync(target, [JSON.stringify({ ...JSON.parse(header), cwd: dir }), ...rest].join("\n"));
	return target;
}

export interface PiRun {
	cwd: string;
	prompt: string;
	withExtension: boolean;
	session?: string;
	flags?: string[];
}

/**
 * Run real pi in print mode with the user's full setup (all installed packages load as usual),
 * plus a payload-capturing extension and, optionally, ours. Returns every request pi sent the model
 * and everything pi printed (warnings go to stderr).
 */
export async function runPi({ cwd, prompt, withExtension, session, flags = [] }: PiRun): Promise<{ requests: unknown[]; printed: string; codemode: string[] }> {
	const captureFile = join(cwd, `payloads-${withExtension ? "ext" : "stock"}-${Date.now()}.jsonl`);
	const args = ["-p", "-e", CAPTURE_EXTENSION, ...flags];
	// A rate-limited default provider should not block verifying another configured model.
	if (process.env.PI_TEST_MODEL) args.push("--model", process.env.PI_TEST_MODEL);
	if (withExtension) args.push("-e", EXTENSION);
	// Stock and extension runs use the same session identity, including provider cache keys.
	args.push(...(session ? ["--session", session] : ["--no-session", "--session-id", basename(cwd)]), prompt);
	const printed = await new Promise<string>((done, fail) => {
		// pi -p reads extra prompt text from a piped stdin and waits for it to close.
		const child = execFile("pi", args, { cwd, env: { ...process.env, CAPTURE_FILE: captureFile }, timeout: 120_000 }, (error, stdout, stderr) =>
			error
				? fail(new Error(`pi failed (code ${error.code}, signal ${error.signal}): ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`))
				: done(`${stdout}\n${stderr}`),
		);
		child.stdin?.end();
	});
	if (!existsSync(captureFile)) throw new Error("pi sent no request to the model");
	const captured: { sources: Record<string, string>; codemodeSchemaIsStock: boolean; payload: unknown }[] = readFileSync(captureFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
	// Drawing-only extensions leave every tool stock; disabled codemode stays absent.
	for (const c of captured) {
		for (const [name, source] of Object.entries(c.sources)) {
			if (name === "codemode" && source === "none") continue;
			if (source !== `builtin:${name}`) throw new Error(`display-only rows must keep pi's own ${name}, but pi used: ${source}`);
		}
	}
	if (captured.some((c) => !c.codemodeSchemaIsStock)) throw new Error("the codemode tool in use does not have pi's own schema object; pi's MCP extension would not recognise it");
	return { requests: captured.map((c) => c.payload), printed, codemode: captured.map((c) => c.sources.codemode) };
}
