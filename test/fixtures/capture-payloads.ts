import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stockCodemode } from "../helpers/codemode";

/**
 * Test-only: append every request pi sends the model to $CAPTURE_FILE, one JSON line each, together with
 * where every covered tool came from. All must stay stock even with our renderers loaded.
 * Also whether the codemode tool in use has the very schema object of pi's own: pi's MCP extension recognises
 * codemode by it (`isCodemodeTool`), so a copy would quietly break MCP's codemode handling.
 */
export default function (pi: ExtensionAPI) {
	const file = process.env.CAPTURE_FILE;
	if (!file) throw new Error("capture-payloads: CAPTURE_FILE is not set");
	pi.on("before_provider_request", (event) => {
		const source = (name: string) => pi.getAllTools().find((tool) => tool.name === name)?.sourceInfo.path ?? "none";
		const codemode = pi.getAllTools().find((tool) => tool.name === "codemode");
		const codemodeSchemaIsStock = codemode === undefined || codemode.parameters === stockCodemode().parameters;
		const sources = Object.fromEntries(["bash", "write", "edit", "codemode", "grep", "find", "ls"].map((name) => [name, source(name)]));
		appendFileSync(file, `${JSON.stringify({ sources, codemodeSchemaIsStock, payload: event.payload })}\n`);
	});
}
