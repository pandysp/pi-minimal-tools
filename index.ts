import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { bashFailed, claudeBash } from "./bash-row";
import { codemodeFailed, shortCodemode } from "./codemode-row";
import { withDot } from "./dotted-row";
import { hideable, watchLevels } from "./levels";
import { shortLook } from "./look-row";
import { replyDot } from "./reply-dot";
import { shortWrite } from "./write-row";

export default function (pi: ExtensionAPI) {
	pi.registerMarkdownTransformer(replyDot);
	watchLevels(pi);
	pi.registerToolRenderer((name, next) => {
		const stock = next();
		// Execution-only custom tools keep pi’s generic drawing, including its result fallback. They cannot hide.
		if (!stock?.renderCall || !stock.renderResult) return stock;
		switch (name) {
			case "bash": return hideable(claudeBash(stock), bashFailed);
			case "write": return hideable(shortWrite(stock));
			case "edit": return hideable(withDot(name, stock));
			case "codemode": return hideable(shortCodemode(stock), codemodeFailed);
			case "grep":
			case "find":
			case "ls": return hideable(shortLook(name, stock));
			default: return hideable(stock);
		}
	});
}
