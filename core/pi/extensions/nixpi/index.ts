/**
 * nixpi — nixPI directory bootstrap, status, and blueprint seeding.
 *
 * @tools nixpi_status
 * @commands /nixpi (init | status | update-blueprints)
 * @hooks session_start, resources_discover
 * @see {@link ../../AGENTS.md#nixpi} Extension reference
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { defineTool, type RegisteredExtensionTool, registerTools } from "../../../lib/extension-tools.js";
import { getNixpiDir } from "../../../lib/filesystem.js";
import { discoverSkillPaths, ensureWorkspace, getPackageDir, handleWorkspaceStatus } from "./actions.js";
import { handleUpdateBlueprints, readBlueprintVersions, seedBlueprints } from "./actions-blueprints.js";

type NixpiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

export default function (pi: ExtensionAPI) {
	const nixpiDir = getNixpiDir();
	const packageDir = getPackageDir();
	const tools: RegisteredExtensionTool[] = [
		defineTool({
			name: "nixpi_status",
			label: "nixPI Status",
			description: "Show nixPI directory location and blueprint state",
			parameters: Type.Object({}),
			async execute() {
				return handleWorkspaceStatus(nixpiDir);
			},
		}),
	];
	registerTools(pi, tools);

	pi.on("session_start", (_event, ctx) => {
		ensureWorkspace(nixpiDir);
		seedBlueprints(nixpiDir, packageDir);

		const versions = readBlueprintVersions(nixpiDir);
		const updates = Object.keys(versions.updatesAvailable);
		if (ctx.hasUI) {
			if (updates.length > 0) {
				ctx.ui.setWidget("nixpi-updates", [
					`${updates.length} blueprint update(s) available — /nixpi update-blueprints`,
				]);
			}
			ctx.ui.setStatus("nixpi", `nixPI: ${nixpiDir}`);
		}
	});

	pi.registerCommand("nixpi", {
		description: "nixPI directory management: /nixpi init | status | update-blueprints",
		handler: async (args: string, ctx) => handleNixpiCommand(pi, nixpiDir, packageDir, args, ctx),
	});

	pi.on("resources_discover", () => {
		const paths = discoverSkillPaths(nixpiDir);
		if (paths) return { skillPaths: paths };
	});
}

async function handleNixpiCommand(
	pi: ExtensionAPI,
	nixpiDir: string,
	packageDir: string,
	args: string,
	ctx: NixpiCommandContext,
): Promise<void> {
	const subcommand = args.trim().split(/\s+/)[0] ?? "";
	if (!subcommand) {
		ctx.ui.notify("Usage: /nixpi init | status | update-blueprints", "info");
		return;
	}

	switch (subcommand) {
		case "init":
			ensureWorkspace(nixpiDir);
			seedBlueprints(nixpiDir, packageDir);
			ctx.ui.notify("nixPI initialized", "info");
			return;
		case "status":
			pi.sendUserMessage("Show nixpi status using the nixpi_status tool.", { deliverAs: "followUp" });
			return;
		case "update-blueprints": {
			const count = handleUpdateBlueprints(nixpiDir, packageDir);
			ctx.ui.notify(count === 0 ? "All blueprints are up to date" : `Updated ${count} blueprint(s)`, "info");
			return;
		}
		default:
			ctx.ui.notify("Usage: /nixpi init | status | update-blueprints", "info");
	}
}
