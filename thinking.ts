import { AssistantMessageComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { goesOn } from "./groups";
import { atLevel1 } from "./levels";

/**
 * Level 1 hides pi's "Thinking..." once the same message goes on with text or a tool call, so only the
 * thinking still in progress shows, like the latest tool row. pi has no hook for this, and an empty label
 * still leaves its blank lines. So we hand pi's message row a copy of the message without the thinking:
 * pi then lays it out as if there were none, with no gap. The row keeps the full message, so levels 2 and 3,
 * Ctrl+T and the saved session are untouched. Same idea as the Calm layout in kunchenguid/firstmate (MIT).
 *
 * This leans on pi 1.0.3's AssistantMessageComponent (updateContent, render, lastMessage and
 * hideThinkingBlock). If one of them goes missing, the session starts with an error instead of quietly
 * showing "Thinking..." again; the real-pi test (levels-replay) catches other changes to how pi draws messages.
 */

type Message = { content: { type: string; text?: string }[] };
interface Row {
	hideThinkingBlock: unknown;
	lastMessage?: Message;
	[HIDING]?: boolean;
}
interface Prototype {
	updateContent(this: Row, message: Message, isStreaming?: boolean): void;
	render(this: Row, width: number): string[];
	/** The current rule. pi's class outlives a /reload of this extension: each load replaces the rule, the wrap stays one. */
	[RULE]?: (row: Row, message: Message) => boolean;
}
const RULE = Symbol.for("pi-minimal-tools.hide-thinking");
const HIDING = Symbol("hiding");

/** pi shows the thinking as its label (Ctrl+T has not expanded it), and the message went on after it. */
const hides = (row: Row, message: Message) =>
	atLevel1() && row.hideThinkingBlock === true && goesOn(message.content);

export function hideThinking(pi: ExtensionAPI) {
	const proto = AssistantMessageComponent?.prototype as unknown as Prototype | undefined;
	const fits = typeof proto?.updateContent === "function" && typeof proto.render === "function";
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const row = fits && (new AssistantMessageComponent() as unknown as Row);
		if (!row || typeof row.hideThinkingBlock !== "boolean" || !("lastMessage" in row)) {
			ctx.ui.notify("pi-minimal-tools: this pi version draws its messages differently, so level 1 cannot hide “Thinking...”. The extension needs an update.", "error");
		}
	});
	if (!fits) return;
	const wrapped = RULE in proto;
	proto[RULE] = hides;
	if (wrapped) return;
	const { updateContent, render } = proto;
	proto.updateContent = function (message, isStreaming) {
		const hiding = proto[RULE]!(this, message);
		updateContent.call(this, hiding ? { ...message, content: message.content.filter((block) => block.type !== "thinking") } : message, isStreaming);
		this.lastMessage = message;
		this[HIDING] = hiding;
	};
	// A level change (Ctrl+O) does not rebuild pi's message rows; the next frame does it here.
	proto.render = function (width) {
		if (this.lastMessage && proto[RULE]!(this, this.lastMessage) !== this[HIDING]) proto.updateContent.call(this, this.lastMessage);
		return render.call(this, width);
	};
}
