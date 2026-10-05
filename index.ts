import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { claudeBash } from "./bash-row";
import { shortCodemode } from "./codemode-row";
import { withDot } from "./dotted-row";
import { shortLook } from "./look-row";
import { replyDot } from "./reply-dot";
import { shortWrite } from "./write-row";

export default function (pi: ExtensionAPI) {
	pi.registerMarkdownTransformer(replyDot);
	pi.registerToolRenderer((name, next) => {
		const stock = next();
		// Execution-only custom tools keep pi’s generic drawing, including its result fallback.
		if (!stock?.renderCall || !stock.renderResult) return stock;
		switch (name) {
			case "bash": return claudeBash(stock);
			case "write": return shortWrite(stock);
			case "edit": return withDot(name, stock);
			case "codemode": return shortCodemode(stock);
			case "grep":
			case "find":
			case "ls": return shortLook(name, stock);
			default: return stock;
		}
	});
}
