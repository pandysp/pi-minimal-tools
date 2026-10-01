import { appendFileSync } from "node:fs";
import { createCodemodeExtension, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Test-only: append every request pi sends the model to $CAPTURE_FILE, one JSON line each, together with
 * where the bash and codemode tools came from, so a test can prove whether it measured stock pi or our extension.
 * Also whether the codemode tool in use has the very schema object of pi's own: pi's MCP extension recognises
 * codemode by it (`isCodemodeTool`), so a copy would quietly break MCP's codemode handling.
 */
export default function (pi: ExtensionAPI) {
	const file = process.env.CAPTURE_FILE;
	if (!file) throw new Error("capture-payloads: CAPTURE_FILE is not set");
	pi.on("before_provider_request", (event) => {
		const source = (name: string) => pi.getAllTools().find((tool) => tool.name === name)?.sourceInfo.path ?? "none";
		let stock: { parameters: unknown } | undefined;
		createCodemodeExtension()({ ...pi, registerTool: (tool: { parameters: unknown }) => (stock = tool) } as unknown as ExtensionAPI);
		const codemode = pi.getAllTools().find((tool) => tool.name === "codemode");
		const codemodeSchemaIsStock = codemode === undefined || codemode.parameters === stock?.parameters;
		appendFileSync(file, `${JSON.stringify({ bash: source("bash"), codemode: source("codemode"), codemodeSchemaIsStock, payload: event.payload })}\n`);
	});
}
