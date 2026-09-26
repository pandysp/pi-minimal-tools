/**
 * Sort a bash command into "look" (list / read / search) or "work".
 * Look commands collapse to one summary line; work gets a full row.
 * Deliberately strict: only a single, clearly read-only command is "look". In a pipe or list the exit
 * code belongs to the last command, so an earlier failure (`cat /missing | head`) would hide in the summary.
 */
export type CommandKind = "list" | "read" | "search" | "work";

const LOOK: Record<string, Exclude<CommandKind, "work">> = {
	ls: "list",
	cat: "read",
	head: "read",
	tail: "read",
	wc: "read",
	grep: "search",
	rg: "search",
	find: "search",
};

/**
 * Pipes, lists, redirects, background jobs, multi-line scripts, and anything the shell expands into
 * other words (`$…`, `{…}`, backticks): never a single, predictable look command.
 */
const COMPOUND_OR_UNSAFE = /[|;&<>`\n${}]/;

/** Flags that make an otherwise read-only command run, write or delete things (`--pre=x` included). */
const WRITING_FLAG = /^(-delete|-exec|-execdir|-ok|-okdir|-fprint.*|-fls|--pre(=.*)?)$/;

/** A word as the shell passes it on: quotes and backslashes removed (`"-delete"`, `-de\lete` → `-delete`). */
const unquoted = (word: string) => word.replace(/["'\\]/g, "");

export function classifyCommand(command: string): CommandKind {
	const trimmed = command.trim();
	if (!trimmed || COMPOUND_OR_UNSAFE.test(trimmed)) return "work";
	const [program, ...rest] = trimmed.split(/\s+/);
	if (rest.some((word) => WRITING_FLAG.test(unquoted(word)))) return "work";
	return LOOK[program] ?? "work";
}
