import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Box, type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { dot } from "./dots";
import { groupOf, summarize, useSession } from "./groups";

/**
 * Three levels on pi's own expand key (Ctrl+O): 1 folds finished calls into one summary line per group, 2 is pi's collapsed
 * view, 3 its expanded view. pi only knows collapsed and expanded, and an extension cannot take over its
 * key without a keybindings.json change. So we watch pi's flag around each key press and turn each flip
 * into one step: 1 → 2 → 3 → 1. Whatever key or menu flips the flag, the cycle follows.
 * Until an interactive session starts (print mode, tests), nothing is hidden.
 */
let level: 1 | 2 | 3 = 2;

export function watchLevels(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		// pi keeps its flag across /new, /resume and /reload; a new session starts hidden unless expanded.
		level = ctx.ui.getToolsExpanded() ? 3 : 1;
		useSession(ctx.sessionManager);
		ctx.ui.onTerminalInput(() => {
			const before = ctx.ui.getToolsExpanded();
			// Runs after the focused component has handled the key and before pi draws the next frame
			// (pi-tui queues that redraw after this), so the corrected flag is drawn without a flash.
			process.nextTick(() => {
				const after = ctx.ui.getToolsExpanded();
				if (after === before) return;
				if (after && level === 1) {
					level = 2;
					ctx.ui.setToolsExpanded(false);
				} else level = after ? 3 : 1;
			});
			return undefined;
		});
	});
}

const STATE = Symbol("levels");
interface RowState {
	call?: Component;
	result?: Component;
	frame?: Box;
}
const rowState = (state: Record<PropertyKey, unknown>) => (state[STATE] ??= {}) as RowState;

/**
 * At level 1 a saved, finished call is folded into its group: the group's first finished call draws the
 * summary line, the others draw nothing. Running calls and calls not saved yet draw their normal row.
 * Undefined means: draw normally.
 */
function folded(toolCallId: string, theme: Theme): string[] | undefined {
	if (level !== 1) return undefined;
	const group = groupOf(toolCallId);
	if (!group || group.calls.get(toolCallId)?.outcome === "running") return undefined;
	const head = group.ids.find((id) => group.calls.get(id)?.outcome !== "running");
	if (head !== toolCallId) return [];
	const { text, failed } = summarize(group.ids.map((id) => group.calls.get(id)!));
	return [`${dot(failed ? "failed" : "succeeded")} ${text}${theme.fg("dim", " (ctrl+o to expand)")}`];
}

/**
 * A tool row that folds into its group's summary at level 1 (see folded). Rows always draw in pi's "self"
 * shell, because only that one draws nothing for an empty row; pi's default shell would leave a blank line.
 * Tools that use the default shell get an identical frame drawn by us.
 */
export function hideable(renderers: ToolRenderers): ToolRenderers {
	const call = renderers.renderCall!;
	const result = renderers.renderResult!;
	const ownShell = renderers.renderShell === "self";
	return {
		renderShell: "self",
		renderCall(args, theme, ctx) {
			const row = rowState(ctx.state);
			// Each renderer gets back its own previous component, as pi would hand it. If it throws, pi draws
			// its generic call line instead, and the result has to be drawn on its own (see renderResult).
			const previous = row.call;
			row.call = undefined;
			row.call = call(args, theme, { ...ctx, lastComponent: previous });
			return {
				render: (width) => {
					const summary = folded(ctx.toolCallId, theme);
					if (summary) return summary.map((line) => truncateToWidth(line, width));
					return ownShell ? row.call!.render(width) : framed(row, theme, ctx).render(width);
				},
				invalidate: () => row.call?.invalidate(),
			};
		},
		renderResult(res, options, theme, ctx) {
			const row = rowState(ctx.state);
			// Never draw an older result: if this renderer throws, pi draws its generic result instead.
			const previous = row.result;
			row.result = undefined;
			row.result = result(res, options, theme, { ...ctx, lastComponent: previous });
			// In our frame the result is drawn together with the call, unless the call renderer threw.
			if (!ownShell && row.call) return { render: () => [], invalidate() {} };
			return { render: (width) => (folded(ctx.toolCallId, theme) ? [] : row.result!.render(width)), invalidate: () => row.result?.invalidate() };
		},
	};
}

/** pi's default shell: padding 1 and the pending, error or success background around call and result. */
function framed(row: RowState, theme: Theme, ctx: { isPartial: boolean; isError: boolean }): Component {
	const frame = (row.frame ??= new Box(1, 1));
	frame.setBgFn((t) => theme.bg(ctx.isPartial ? "toolPendingBg" : ctx.isError ? "toolErrorBg" : "toolSuccessBg", t));
	frame.clear();
	frame.addChild(row.call!);
	if (row.result) frame.addChild(row.result);
	return frame;
}
