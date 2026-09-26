import { type Component, Text } from "@earendil-works/pi-tui";

/**
 * pi swallows errors thrown by a tool's drawing code and quietly shows only the tool name.
 * Wrap our drawing code so a crash shows up as a red line in the row instead.
 */
export function loud<A extends unknown[]>(tool: string, draw: (...args: A) => Component): (...args: A) => Component {
	return (...args) => {
		try {
			const component = draw(...args);
			return {
				render(width: number) {
					try {
						return component.render(width);
					} catch (error) {
						return failure(tool, error).render(width);
					}
				},
				invalidate: () => component.invalidate?.(),
			};
		} catch (error) {
			return failure(tool, error);
		}
	};
}

const failure = (tool: string, error: unknown) =>
	new Text(`\x1b[31mpi-minimal-tools: drawing the ${tool} row failed: ${error instanceof Error ? error.message : String(error)}\x1b[39m`, 0, 0);
