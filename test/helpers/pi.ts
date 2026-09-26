import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "../..");
export const EXTENSION = join(REPO, "index.ts");
export const CAPTURE_EXTENSION = join(REPO, "test/fixtures/capture-payloads.ts");

/**
 * This checkout and, when testing from a git worktree, the main checkout, which the user may have
 * installed. Any other installed copy is caught by runPi's check on which bash pi used.
 */
const CHECKOUTS = [
	...new Set([REPO, dirname(resolve(REPO, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: REPO, encoding: "utf8" }).trim()))]),
];

/**
 * A fresh project directory for pi runs. Its project settings switch off any installed copy of this
 * package, so a run without `-e EXTENSION` really is stock pi, whether or not the user installed it.
 */
export function tempDir(prefix: string, settings: object = {}): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), `pi-claude-tools-${prefix}-`)));
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
}

/**
 * Run real pi in print mode with the user's full setup (all installed packages load as usual),
 * plus a payload-capturing extension and, optionally, ours. Returns every request pi sent the model
 * and everything pi printed (warnings go to stderr).
 */
export async function runPi({ cwd, prompt, withExtension, session }: PiRun): Promise<{ requests: unknown[]; printed: string }> {
	const captureFile = join(cwd, `payloads-${withExtension ? "ext" : "stock"}-${Date.now()}.jsonl`);
	const args = ["-p", "-e", CAPTURE_EXTENSION];
	if (withExtension) args.push("-e", EXTENSION);
	args.push(...(session ? ["--session", session] : ["--no-session"]), prompt);
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
	const captured: { bash: string; payload: unknown }[] = readFileSync(captureFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
	// Prove which side was measured: pi's own bash, or this checkout's. Any other copy fails loudly.
	const expected = (bash: string) => (withExtension ? bash.startsWith(REPO) : bash === "<builtin:bash>");
	for (const { bash } of captured) {
		if (!expected(bash)) throw new Error(`expected ${withExtension ? "this checkout's" : "pi's own"} bash, but pi used: ${bash}`);
	}
	return { requests: captured.map((c) => c.payload), printed };
}
