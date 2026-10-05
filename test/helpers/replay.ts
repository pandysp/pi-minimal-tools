import { execFileSync } from "node:child_process";
import { plain } from "./claude-code";
import { EXTENSION, copySession, tempDir } from "./pi";

const tmux = (...args: string[]) => execFileSync("tmux", args, { encoding: "utf8" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resume a recorded session in real, interactive pi (the user's full setup loads as usual) and
 * return the whole screen, colours included, once it has stopped changing and Ctrl+O was pressed `presses`
 * times. Stock pi starts collapsed and Ctrl+O expands; ours starts at level 1 (finished successes hidden),
 * then 2 (collapsed) and 3 (expanded). The window is tall enough for the whole session: in fullscreen
 * mode pi keeps no scrollback.
 */
export async function replay(fixture: string, withExtension: boolean, cwd = tempDir("replay"), { presses = 0, height = 300 } = {}): Promise<string[]> {
	const session = copySession(fixture, cwd);
	const name = `pct-replay-${process.pid}-${Date.now()}`;
	const command = `pi ${withExtension ? `-e ${EXTENSION} ` : ""}--session ${session}`;
	tmux("new-session", "-d", "-s", name, "-x", "200", "-y", String(height), "-c", cwd, command);
	try {
		let last = "";
		let stable = 0;
		for (let waited = 0; stable < 3; waited += 1000) {
			if (waited > 60_000) throw new Error(`pi did not settle within 60 s replaying ${fixture}`);
			await sleep(1000);
			const screen = tmux("capture-pane", "-e", "-p", "-S", "-3000", "-t", name);
			stable = screen === last && screen.includes("hydra") ? stable + 1 : 0;
			last = screen;
		}
		for (let i = 0; i < presses; i++) {
			tmux("send-keys", "-t", name, "C-o");
			await sleep(1000);
			last = tmux("capture-pane", "-e", "-p", "-S", "-3000", "-t", name);
		}
		return last.split("\n");
	} finally {
		tmux("kill-session", "-t", name);
	}
}



/**
 * Split a replayed single-turn session into what comes before the tool calls (header, prompt), the
 * tool calls themselves, and what comes after (reply, footer). The anchors are the last words of the
 * prompt and the first words of the reply.
 */
export function splitAtToolCalls(screen: string[], promptEnd: string, replyStart: string) {
	const lines = plain(screen);
	const from = lines.findIndex((l) => l.includes(promptEnd));
	const to = lines.findIndex((l, i) => i > from && l.replace(/^\s*⏺ /, "").startsWith(replyStart));
	if (from === -1 || to === -1) throw new Error(`anchors not found: "${promptEnd}" … "${replyStart}"`);
	return { before: lines.slice(0, from + 1), tools: lines.slice(from + 1, to), after: lines.slice(to) };
}

/** Yesterday's reference count: non-empty lines, without separators, hydra notes and "Thinking...". */
export const countedLines = (lines: string[]) =>
	lines.filter((l) => l.trim() !== "" && !/^[─━\s]+$|hydra|\[navigator\]|\[simplifier\]|Thinking\.\.\./.test(l));
