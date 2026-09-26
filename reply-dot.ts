const DOT = "⏺ ";

/**
 * Claude Code's dot in front of agent replies. Display only: pi feeds this the raw markdown on every
 * frame, so the dot never reaches the session or the model.
 * Approach from pi-cc-style-tools (MIT, newCman1): skip user messages and thinking, never stack a
 * second dot, and only put it before plain text: headings, lists, quotes, tables and code blocks would
 * break. While streaming, a leading backtick or tilde may be the start of a code block.
 */
export const replyDot = (markdown: string, { messageType, isStreaming }: { messageType: string; isStreaming?: boolean }) => {
	if (messageType !== "assistant") return markdown;
	const text = markdown.replace(/^(\s*\n)+/, "");
	if (!text.trim() || text.startsWith(DOT) || !startsWithPlainText(text, isStreaming)) return markdown;
	// Up to 3 leading spaces mean nothing to a markdown paragraph.
	return DOT + text.replace(/^ {1,3}/, "");
};

/** Headings, lists, quotes, tables and code blocks (fenced or indented) would break with a dot in front. */
const BLOCK_SYNTAX = /^( {4}|\t| {0,3}([#>|]|[-*+] |\d+[.)] |```|~~~))/;
const startsWithPlainText = (text: string, isStreaming?: boolean) =>
	!BLOCK_SYNTAX.test(text) && !(isStreaming && /^ {0,3}[`~]/.test(text));
