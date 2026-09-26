import { describe, expect, it } from "vitest";
import { replyDot } from "../reply-dot";

describe("white dot in front of agent replies (Claude Code style, display only)", () => {
	it.each([
		["agent reply gets the dot", "Done.", { messageType: "assistant" }, "⏺ Done."],
		["leading whitespace is dropped before the dot", "\n  Done.", { messageType: "assistant" }, "⏺ Done."],
		["a reply that opens with inline code gets the dot", "`foo` works", { messageType: "assistant" }, "⏺ `foo` works"],
		["no dot before a code block (it would break the block)", "```js\nx\n```", { messageType: "assistant" }, "```js\nx\n```"],
		["while streaming, any leading backtick may be a code block", "`", { messageType: "assistant", isStreaming: true }, "`"],
		["never a second dot", "⏺ Done.", { messageType: "assistant" }, "⏺ Done."],
		["empty reply stays empty", "", { messageType: "assistant" }, ""],
		["user messages untouched", "hi", { messageType: "user" }, "hi"],
		["thinking untouched", "hmm", { messageType: "assistant-thinking" }, "hmm"],
	] as const)("%s", (_name, markdown, context, expected) => {
		expect(replyDot(markdown, context)).toBe(expected);
	});

	it.each([
		["# Heading\ntext"],
		["~~~js\ncode\n~~~"],
		["    indented code"],
		["- item one\n- item two"],
		["1. first"],
		["> quoted"],
		["| a | b |\n|---|---|"],
	])("no dot before block syntax, the markdown stays untouched: %j", (markdown) => {
		expect(replyDot(markdown, { messageType: "assistant" })).toBe(markdown);
	});

	it("blank lines before a paragraph are dropped, then the dot", () => {
		expect(replyDot("\n\nDone.", { messageType: "assistant" })).toBe("⏺ Done.");
	});
});
