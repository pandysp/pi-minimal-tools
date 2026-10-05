import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Box, type Component, truncateToWidth } from "@earendil-works/pi-tui";
import { dot } from "./dots";
import { folds, groupOf, summarize, useSession, writing } from "./groups";

/**
 * Three levels on pi's own expand key (Ctrl+O): 1 folds finished calls into one summary line per group, 2 is pi's collapsed
 * view, 3 its expanded view. pi only knows collapsed and expanded, and an extension cannot take over its
 * key without a keybindings.json change. So we watch pi's flag around each key press and turn each flip
 * into one step: 1 → 2 → 3 → 1. Whatever key or menu flips the flag, the cycle follows.
 * Until an interactive session starts (print mode, tests), nothing is hidden.
 */
let level: 1 | 2 | 3 = 2;
export const atLevel1 = () => level === 1;

export function watchLevels(pi: ExtensionAPI) {
	// pi tells extensions before it draws, so the older call folds in the frame in which the next one appears.
	pi.on("message_update", (event) => writing(event.message));
	pi.on("message_end", () => writing(undefined));
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		// pi keeps its flag across /new, /resume and /reload; a new session starts hidden unless expanded.
		level = ctx.ui.getToolsExpanded() ? 3 : 1;
		useSession(ctx.sessionManager);
		opened.clear();
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
	/** The row draws its group's summary at level 1; set by renderCall, which pi calls before renderResult. */
	head?: boolean;
	/** pi's expanded flag at the last renderCall: a click on the summary is a change of it. */
	expanded?: boolean;
	call?: Component;
	result?: Component;
	frame?: Box;
}
const rowState = (state: Record<PropertyKey, unknown>) => (state[STATE] ??= {}) as RowState;

/** Groups opened by a click on their summary line: the click expands the first row, which draws the summary. */
const opened = new Set<string>();

/**
 * What a row draws at level 1. A folded call draws nothing, except the group's first folded call, which draws
 * the summary line (and its own row below it when the group is opened). Other calls draw their normal row.
 */
type Fold = "row" | "nested" | "nothing" | { summary: string; open: boolean };
function fold(toolCallId: string, theme: Theme): Fold {
	if (level !== 1) return "row";
	const group = groupOf(toolCallId);
	if (!group || !folds(group.calls.get(toolCallId))) return "row";
	const head = group.ids.find((id) => folds(group.calls.get(id)))!;
	const open = opened.has(head);
	if (head !== toolCallId) return open ? "nested" : "nothing";
	const text = summarize(group.ids.map((id) => group.calls.get(id)!));
	// ▸ closed, ▾ open, in grey: it reads as a heading, not as a command. Only "(N failed)" is red.
	const words = text.split(/( \(\d+ failed\))/).map((part, i) => theme.fg(i % 2 ? "error" : "muted", part)).join("");
	return { summary: `${dot("running", open ? "▾" : "▸")} ${words}${theme.fg("dim", " (ctrl+o to expand)")}`, open };
}

/** The rows of an opened group, 2 columns to the right of their summary line. */
const nest = (draw: (width: number) => string[], width: number) => draw(width - 2).map((line) => `  ${line}`);
const isHead = (fold: Fold) => typeof fold === "object";

/**
 * A tool row that folds into its group's summary at level 1 (see fold). Rows always draw in pi's "self"
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
			// At level 1 pi expands a row only on a click. On the summary's row that opens the group, and the
			// row itself still draws collapsed.
			row.head = level === 1 && isHead(fold(ctx.toolCallId, theme));
			// A click flips the flag. Toggle on the change, not the value: the row may have been clicked while it
			// was still the latest call, before it folded. Ctrl+O redraws every row at level 2 or 3, which closes it.
			const clicked = row.expanded !== undefined && row.expanded !== ctx.expanded;
			row.expanded = ctx.expanded;
			if (level !== 1) opened.delete(ctx.toolCallId);
			else if (row.head && clicked) {
				if (!opened.delete(ctx.toolCallId)) opened.add(ctx.toolCallId);
			}
			const expanded = row.head ? false : ctx.expanded;
			// Each renderer gets back its own previous component, as pi would hand it. If it throws, pi draws
			// its generic call line instead, and the result has to be drawn on its own (see renderResult).
			const previous = row.call;
			row.call = undefined;
			row.call = call(args, theme, { ...ctx, expanded, lastComponent: previous });
			return {
				render: (width) => {
					const f = fold(ctx.toolCallId, theme);
					if (f === "nothing") return [];
					const own = (w: number) => (ownShell ? row.call!.render(w) : framed(row, theme, ctx).render(w));
					if (f === "row") return own(width);
					if (f === "nested") return nest(own, width);
					return [truncateToWidth(f.summary, width), ...(f.open ? ["", ...nest(own, width)] : [])];
				},
				invalidate: () => row.call?.invalidate(),
			};
		},
		renderResult(res, options, theme, ctx) {
			const row = rowState(ctx.state);
			const expanded = row.head ? false : options.expanded;
			// Never draw an older result: if this renderer throws, pi draws its generic result instead.
			const previous = row.result;
			row.result = undefined;
			row.result = result(res, { ...options, expanded }, theme, { ...ctx, expanded, lastComponent: previous });
			// In our frame the result is drawn together with the call, unless the call renderer threw.
			if (!ownShell && row.call) return { render: () => [], invalidate() {} };
			return {
				render: (width) => {
					const f = fold(ctx.toolCallId, theme);
					if (f === "row") return row.result!.render(width);
					return f === "nested" || (typeof f === "object" && f.open) ? nest((w) => row.result!.render(w), width) : [];
				},
				invalidate: () => row.result?.invalidate(),
			};
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
