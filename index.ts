import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { claudeBash } from "./bash-row";
import { shortCodemode } from "./codemode-row";
import { withDot } from "./dotted-row";
import { foldable } from "./groups";
import { hideable, watchLevels } from "./levels";
import { shortLook } from "./look-row";
import { shortWrite } from "./write-row";

export default function (pi: ExtensionAPI) {
	watchLevels(pi);
	pi.registerToolRenderer((name, next) => {
		const stock = next();
		// Execution-only custom tools keep pi’s generic drawing, including its result fallback. They cannot fold.
		if (!stock?.renderCall || !stock.renderResult) return stock;
		foldable.add(name);
		switch (name) {
			case "bash": return hideable(claudeBash(stock));
			case "write": return hideable(shortWrite(stock));
			case "edit": return hideable(withDot(name, stock));
			case "codemode": return hideable(shortCodemode(stock));
			case "grep":
			case "find":
			case "ls": return hideable(shortLook(name, stock));
			default: return hideable(stock);
		}
	});
}
