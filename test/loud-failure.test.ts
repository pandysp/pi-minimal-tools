import { createBashToolDefinition, createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { plain } from "./helpers/claude-code";
import { describe, expect, it } from "vitest";
import { claudeBash } from "../bash-row";
import { withDot } from "../dotted-row";
import { renderRow } from "./helpers/row";

// pi swallows errors thrown by a tool's drawing code and quietly shows only the tool name.
// Ours must fail loudly instead, so a pi update that breaks a row is noticed.
const broken = <T extends { renderCall?: unknown; renderResult?: unknown }>(definition: T): T => ({
	...definition,
	renderCall: () => {
		throw new Error("stock renderCall changed");
	},
	renderResult: () => {
		throw new Error("stock renderResult changed");
	},
});

describe("a crash in the drawing code is visible in the row", () => {
	it.each([
		["bash", () => claudeBash(broken(createBashToolDefinition("/tmp"))), { command: "npm test" }],
		["write", () => withDot(broken(createWriteToolDefinition("/tmp"))), { path: "a.md", content: "x" }],
	] as const)("%s", (_name, definition, args) => {
		const text = plain(renderRow({ definition: definition(), args, result: { text: "done" }, expanded: true })).join("\n");
		expect(text).toMatch(/pi-claude-tools: drawing the (bash|write) row failed: stock render(Call|Result) changed/);
	});
});
