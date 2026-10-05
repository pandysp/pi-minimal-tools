import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { bashFailed } from "./bash-row";
import { codemodeFailed } from "./codemode-row";

/**
 * Level 1 folds the finished tool calls of a group into one summary line. A group is a run of tool calls
 * that nothing visible interrupts: your messages and the agent's text end it; its thinking does not.
 * Groups and outcomes come from the saved session, so a resumed session looks the same as a live one.
 * A call folds once it has finished and something later shows (the next call, text or a message), so the
 * latest call stays visible as its row while the model thinks about the next one.
 */

/** Tools whose rows can fold (we wrap their renderers). Any other tool draws its own row, which ends a group. */
export const foldable = new Set<string>();

type Outcome = "running" | "ok" | "failed";
interface Call {
	name: string;
	args: unknown;
	outcome: Outcome;
	/** Something was saved after the call's message. */
	followed: boolean;
}

/** Text pi draws: the agent's words, not its thinking. */
const visibleText = (blocks: { type: string; text?: string }[]) => blocks.some((block) => block.type === "text" && !!block.text?.trim());

/** The model is writing a tool call or text that is not saved yet. pi draws it before it saves it. */
let writingVisible = false;
export function writing(message: { role?: string; content?: unknown } | undefined) {
	const blocks = (message?.role === "assistant" && Array.isArray(message.content) ? message.content : []) as { type: string; text?: string }[];
	writingVisible = visibleText(blocks) || blocks.some((block) => block.type === "toolCall");
}

/** A finished call folds once something later shows: saved, or still being written by the model. */
export const folds = (call: Call | undefined) => !!call && call.outcome !== "running" && (call.followed || writingVisible);
interface Groups {
	groupOf: Map<string, string[]>;
	calls: Map<string, Call>;
}

type SessionManager = ExtensionContext["sessionManager"];
let sessionManager: SessionManager | undefined;
let cache: { key: string; groups: Groups } | undefined;

export function useSession(manager: SessionManager | undefined) {
	sessionManager = manager;
	cache = undefined;
}

/** The group of a saved call, with each call's outcome. Undefined for calls not saved yet, or outside a session. */
export function groupOf(toolCallId: string): { ids: string[]; calls: Map<string, Call> } | undefined {
	if (!sessionManager) return undefined;
	const key = `${sessionManager.getLeafId()} ${foldable.size}`;
	if (cache?.key !== key) cache = { key, groups: build(sessionManager) };
	const ids = cache.groups.groupOf.get(toolCallId);
	return ids && { ids, calls: cache.groups.calls };
}

function build(manager: SessionManager): Groups {
	const groupOf = new Map<string, string[]>();
	const calls = new Map<string, Call>();
	let current: string[] = [];
	let unfollowed: Call[] = [];
	const follow = () => {
		for (const call of unfollowed) call.followed = true;
		unfollowed = [];
	};
	const end = () => {
		for (const id of current) groupOf.set(id, current);
		current = [];
	};
	for (const entry of manager.getBranch()) {
		// Summaries and shown extension messages are drawn in the chat; hidden ones (display: false) are not.
		if ((entry.type === "custom_message" && entry.display) || entry.type === "compaction" || entry.type === "branch_summary") {
			follow();
			end();
		}
		if (entry.type !== "message") continue;
		const message = entry.message as { role: string; content?: unknown; toolCallId?: string; isError?: boolean; details?: unknown };
		if (message.role === "toolResult") {
			const call = calls.get(message.toolCallId ?? "");
			if (call) call.outcome = failed(call, message) ? "failed" : "ok";
			continue;
		}
		follow();
		if (message.role !== "assistant") {
			end();
			continue;
		}
		const blocks = (Array.isArray(message.content) ? message.content : []) as { type: string; text?: string; id?: string; name?: string; arguments?: unknown }[];
		if (visibleText(blocks)) end();
		for (const block of blocks) {
			if (block.type !== "toolCall" || !block.id) continue;
			if (!foldable.has(block.name ?? "")) {
				end();
				continue;
			}
			current.push(block.id);
			const call: Call = { name: block.name ?? "", args: block.arguments, outcome: "running", followed: false };
			calls.set(block.id, call);
			unfollowed.push(call);
		}
	}
	end();
	return { groupOf, calls };
}

/** The same failure rules as the rows: a grep that found nothing and a codemode script with a failed call inside. */
function failed(call: Call, result: { content?: unknown; isError?: boolean; details?: unknown }): boolean {
	const outcome = { content: (result.content ?? []) as never, details: result.details };
	const isError = result.isError === true;
	if (call.name === "bash") return bashFailed(outcome, { args: call.args, isError });
	if (call.name === "codemode") return codemodeFailed(outcome, { isError });
	return isError;
}

const KINDS = [
	{ tool: "bash", words: (n: number) => `ran ${n} ${n === 1 ? "command" : "commands"}` },
	{ tool: "write", words: (n: number) => `created ${n} ${n === 1 ? "file" : "files"}` },
	{ tool: "read", words: (n: number) => `read ${n} ${n === 1 ? "file" : "files"}` },
	{ tool: "edit", words: (n: number) => `edited ${n} ${n === 1 ? "file" : "files"}` },
];

/** "Ran 3 commands (2 failed), read 1 file, and 2 more actions": the folded calls, in a fixed order. */
export function summarize(calls: Call[]): string {
	const parts: string[] = [];
	const count = (matches: (call: Call) => boolean) => {
		const done = calls.filter((call) => folds(call) && matches(call));
		return { n: done.length, failed: done.filter((call) => call.outcome === "failed").length };
	};
	const withFailed = (words: string, failed: number) => (failed ? `${words} (${failed} failed)` : words);
	for (const kind of KINDS) {
		const { n, failed } = count((call) => call.name === kind.tool);
		if (n) parts.push(withFailed(kind.words(n), failed));
	}
	const other = count((call) => !KINDS.some((kind) => kind.tool === call.name));
	if (other.n) {
		const words = parts.length ? `and ${other.n} more ${other.n === 1 ? "action" : "actions"}` : `${other.n} ${other.n === 1 ? "action" : "actions"}`;
		parts.push(withFailed(words, other.failed));
	}
	const text = parts.join(", ");
	return text.charAt(0).toUpperCase() + text.slice(1);
}
