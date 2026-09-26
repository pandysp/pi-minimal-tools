import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createWriteToolDefinition,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { claudeBash } from "./bash-row";
import { withDot } from "./dotted-row";
import { replyDot } from "./reply-dot";

export default function (pi: ExtensionAPI) {
	pi.registerMarkdownTransformer(replyDot);

	pi.on("session_start", (_event, ctx) => {
		// Build the tools exactly as stock pi does (agent-session.js): same directory; bash gets its
		// settings-derived options, write and edit get none.
		const settings = SettingsManager.create(ctx.cwd, undefined, { projectTrusted: ctx.isProjectTrusted() });
		const bash = createBashToolDefinition(ctx.cwd, {
			shellPath: settings.getShellPath(),
			commandPrefix: settings.getShellCommandPrefix(),
		});

		// Registering a tool switches it on. Keep the user's active set exactly as it was.
		const active = pi.getActiveTools();
		pi.registerTool(claudeBash(bash));
		pi.registerTool(withDot(createWriteToolDefinition(ctx.cwd)));
		pi.registerTool(withDot(createEditToolDefinition(ctx.cwd)));
		pi.setActiveTools(active);
	});
}
