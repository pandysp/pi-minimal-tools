import { describe, expect, it, vi } from "vitest";

/** A pi whose message row lacks some of what level 1 relies on to hide "Thinking...". */
const fake = vi.hoisted(() => ({ fields: {} as Record<string, unknown> }));
vi.mock("@earendil-works/pi-coding-agent", () => ({
	AssistantMessageComponent: class {
		constructor() { Object.assign(this, fake.fields); }
		updateContent() {}
		render() { return []; }
	},
}));

describe("a pi that draws its messages differently", () => {
	it.each([
		["hideThinkingBlock", { lastMessage: undefined }],
		["lastMessage", { hideThinkingBlock: true }],
	])("without %s, says so with an error when the session starts, instead of quietly showing Thinking... again", async (_missing, fields) => {
		fake.fields = fields;
		const { hideThinking } = await import("../thinking");
		let start: ((event: unknown, ctx: unknown) => void) | undefined;
		hideThinking({ on: (_event: string, handler: typeof start) => { start = handler; } } as never);
		const notify = vi.fn();
		start!({ type: "session_start" }, { mode: "tui", ui: { notify } });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("cannot hide “Thinking...”"), "error");
	});
});
