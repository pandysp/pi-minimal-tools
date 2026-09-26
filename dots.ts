/** Claude Code's dot, in Claude Code's exact 256-colour codes (captured from Claude Code 2.1.280). */
const COLOUR = { succeeded: 114, failed: 211, running: 246 } as const;

export function dot(state: keyof typeof COLOUR): string {
	return `\x1b[38;5;${COLOUR[state]}m⏺\x1b[39m`;
}
