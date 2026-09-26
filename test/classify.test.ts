import { describe, expect, it } from "vitest";
import { classifyCommand } from "../classify";

// "look" commands collapse to one summary line; everything else is "work" and gets a full row.
// Rule: when in doubt, "work". Showing too much is harmless; hiding a change is not.
// The look list is kept to what Claude Code showed plus basics: ls, cat, head, tail, wc, grep, rg, find.
// Only a single command collapses: in a pipe or list the exit code belongs to the last command,
// so an earlier failure (e.g. "cat /missing | head") would hide inside the summary line.
const cases: [command: string, expected: ReturnType<typeof classifyCommand>][] = [
	// Listing (Claude Code: "Listed 1 directory")
	["ls", "list"],
	["ls -la", "list"],
	["ls -la /usr/bin | head -80", "work"],
	["ls /nonexistent", "list"],
	["ls; true", "work"],
	["tree src", "work"],
	// Reading (Claude Code: "Read 1 file")
	["cat sample.txt", "read"],
	["cat missing.txt", "read"],
	["head -2 sample.txt", "read"],
	["tail -1 sample.txt", "read"],
	["wc -l sample.txt", "read"],
	["nl sample.txt", "work"],
	["cat a.txt | sort | uniq -c", "work"],
	// Searching (Claude Code: "Searched for 1 pattern")
	["grep -n beta sample.txt", "search"],
	["grep -rn 'TODO' src | head -20", "work"],
	["rg alpha", "search"],
	["rg -l 'fn main' --type rust", "search"],
	["find . -name '*.txt'", "search"],
	["find /usr/share/dict -type f", "search"],
	["find src -type f | wc -l", "work"],
	["fd config", "work"],
	// Work: changes things
	["rm x.tmp", "work"],
	["ls && rm x.tmp", "work"],
	["ls; npm install", "work"],
	["find . -name '*.tmp' -delete", "work"],
	["find . -name '*.log' -exec rm {} \\;", "work"],
	["find . -execdir touch {} +", "work"],
	["find . -fprint out.txt", "work"],
	["fd -x rm", "work"],
	["fd --exec rm", "work"],
	["rg --pre ./script.sh foo", "work"],
	["ls > files.txt", "work"],
	["cat a.txt > b.txt", "work"],
	["cat a.txt >> b.txt", "work"],
	["grep x a.txt 2>/dev/null", "work"],
	["echo $(ls)", "work"],
	["echo `ls`", "work"],
	["cat <(ls)", "work"],
	["ls | xargs wc -l", "work"],
	["ls | xargs rm", "work"],
	["sudo ls", "work"],
	["FOO=1 ls", "work"],
	["ls &", "work"],
	["cat a.txt | tee b.txt", "work"],
	["sed -i 's/a/b/' a.txt", "work"],
	["awk '{print}' a.txt", "work"],
	// Work: other commands (Claude Code shows these as full rows too)
	["sw_vers", "work"],
	["seq 1 20", "work"],
	["git status", "work"],
	["git diff", "work"],
	["false", "work"],
	["echo hello", "work"],
	["cd src && ls", "work"],
	["sleep 6; cat sample.txt", "work"],
	["npm test", "work"],
	// Edge cases
	["", "work"],
	["   ", "work"],
	["ls\nrm -rf build", "work"],
	["cat /missing | head", "work"],
	["cat /missing; true", "work"],
	["cat /missing || true", "work"],
	// The shell decodes quotes and backslashes, and expands $… and {…} (code review 2026-09-26)
	["rg --pre=./script.sh foo", "work"],
	['find . "-delete"', "work"],
	["find . '-delete'", "work"],
	["find . -de\\lete", "work"],
	["find . $X", "work"],
	["find . {-delete,}", "work"],
	["grep -n 'TODO' src/a.ts", "search"],
	['grep "two words" a.txt', "search"],
];

describe("classifyCommand", () => {
	it.each(cases)("%j → %s", (command, expected) => {
		expect(classifyCommand(command)).toBe(expected);
	});
});
