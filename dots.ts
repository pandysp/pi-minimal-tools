/** Claude Code's dot, in Claude Code's exact 256-colour codes (captured from Claude Code 2.1.280). */
const COLOUR = { succeeded: 114, failed: 211, running: 246 } as const;

/** The dot, or another marker in the same colours (the level-1 summary uses ▸ and ▾). */
export function dot(state: keyof typeof COLOUR, marker = "⏺"): string {
	return `\x1b[38;5;${COLOUR[state]}m${marker}\x1b[39m`;
}
