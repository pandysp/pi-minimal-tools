import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Box, type Component } from "@earendil-works/pi-tui";

type RenderResult = NonNullable<ToolRenderers["renderResult"]>;
export type Failed = (result: Parameters<RenderResult>[0], ctx: Parameters<RenderResult>[3]) => boolean;

/**
 * Three levels on pi's own expand key (Ctrl+O): 1 hides finished successful rows, 2 is pi's collapsed
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
	failed?: boolean;
	frame?: Box;
}
const rowState = (state: Record<PropertyKey, unknown>) => (state[STATE] ??= {}) as RowState;
const hidden = (row: RowState, ctx: { isPartial: boolean }) => level === 1 && !ctx.isPartial && !row.failed;

/**
 * A tool row that disappears at level 1 once it has succeeded. Running and failed rows stay.
 * Rows always draw in pi's "self" shell, because only that one draws nothing for an empty row; pi's default
 * shell would leave a blank line. Tools that use the default shell get an identical frame drawn by us.
 */
export function hideable(renderers: ToolRenderers, failed: Failed = (_result, ctx) => ctx.isError): ToolRenderers {
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
				render: (width) => (hidden(row, ctx) ? [] : ownShell ? row.call!.render(width) : framed(row, theme, ctx).render(width)),
				invalidate: () => row.call?.invalidate(),
			};
		},
		renderResult(res, options, theme, ctx) {
			const row = rowState(ctx.state);
			row.failed = failed(res, ctx);
			// Never draw an older result: if this renderer throws, pi draws its generic result instead.
			const previous = row.result;
			row.result = undefined;
			row.result = result(res, options, theme, { ...ctx, lastComponent: previous });
			// In our frame the result is drawn together with the call, unless the call renderer threw.
			if (!ownShell && row.call) return { render: () => [], invalidate() {} };
			return { render: (width) => (hidden(row, ctx) ? [] : row.result!.render(width)), invalidate: () => row.result?.invalidate() };
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
