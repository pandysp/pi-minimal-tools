import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Test-only: append every request pi sends the model to $CAPTURE_FILE, one JSON line each, together with
 * where the bash tool came from, so a test can prove whether it measured stock pi or our extension.
 */
export default function (pi: ExtensionAPI) {
	const file = process.env.CAPTURE_FILE;
	if (!file) throw new Error("capture-payloads: CAPTURE_FILE is not set");
	pi.on("before_provider_request", (event) => {
		const bash = pi.getAllTools().find((tool) => tool.name === "bash")?.sourceInfo.path ?? "none";
		appendFileSync(file, `${JSON.stringify({ bash, payload: event.payload })}\n`);
	});
}
