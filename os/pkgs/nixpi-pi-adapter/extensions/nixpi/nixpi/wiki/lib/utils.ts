export { EmptyToolParams, errorResult, textToolResult, toToolResult, truncate } from "../../../../../../nixpi-wiki/src/api.ts";

export type RegisteredExtensionTool = {
	name: string;
	label?: string;
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters?: unknown;
	execute: (...args: any[]) => unknown;
};

export function registerTools(registry: { registerTool(tool: any): void }, tools: readonly RegisteredExtensionTool[]): void {
	for (const tool of tools) {
		registry.registerTool(tool);
	}
}
