/**
 * bloom-topics — Conversation topic management and session organization.
 *
 * @commands /topic (new | close | list | switch)
 * @hooks session_start, before_agent_start
 * @see {@link ../../AGENTS.md#bloom-topics} Extension reference
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildTopicGuidance, getActiveTopic, getTopics } from "./actions.js";

export default function (pi: ExtensionAPI) {
	let lastCtx: ExtensionContext | null = null;

	pi.on("session_start", (_event, ctx) => {
		lastCtx = ctx;
	});

	pi.on("before_agent_start", async (event) => {
		return { systemPrompt: event.systemPrompt + buildTopicGuidance() };
	});

	pi.registerCommand("topic", {
		description: "Manage conversation topics: /topic new <name> | close | list | switch <name>",
		handler: async (args: string, ctx) => {
			lastCtx = ctx;
			const parts = args.trim().split(/\s+/);
			const sub = parts[0] ?? "";
			const name = parts.slice(1).join(" ");

			switch (sub) {
				case "new": {
					if (!name) {
						ctx.ui.notify("Usage: /topic new <name>", "warning");
						return;
					}
					const leaf = ctx.sessionManager.getLeafEntry();
					const branchPoint = leaf?.id;
					pi.appendEntry("bloom-topic", { name, status: "active", branchPoint });
					ctx.ui.notify(`Topic started: ${name}`, "info");
					pi.sendUserMessage(
						`We are now focusing on a new topic: "${name}". Please keep your responses focused on this topic until it is closed.`,
						{ deliverAs: "followUp" },
					);
					break;
				}

				case "close": {
					const active = getActiveTopic(lastCtx);
					if (!active) {
						ctx.ui.notify("No active topic to close.", "warning");
						return;
					}
					pi.appendEntry("bloom-topic", {
						name: active.name,
						status: "closed",
						branchPoint: active.branchPoint,
					});
					ctx.ui.notify(`Topic closed: ${active.name}`, "info");
					pi.sendUserMessage(
						`The topic "${active.name}" is now closed. Please summarize what was discussed and accomplished, then return to the main conversation.`,
						{ deliverAs: "followUp" },
					);
					break;
				}

				case "list": {
					const topics = getTopics(lastCtx);
					if (topics.length === 0) {
						ctx.ui.notify("No topics found in this session.", "info");
						return;
					}
					const lines = topics.map((t) => `${t.status === "active" ? "* " : "  "}${t.name} [${t.status}]`);
					ctx.ui.notify(lines.join("\n"), "info");
					break;
				}

				case "switch": {
					if (!name) {
						ctx.ui.notify("Usage: /topic switch <name>", "warning");
						return;
					}
					const topics = getTopics(lastCtx);
					const target = topics.find((t) => t.name === name);
					if (!target) {
						ctx.ui.notify(`Topic not found: ${name}`, "warning");
						return;
					}
					if (target.branchPoint) {
						const result = await ctx.navigateTree(target.branchPoint, {
							summarize: true,
							label: `topic: ${name}`,
						});
						if (result.cancelled) {
							ctx.ui.notify(`Switch to topic "${name}" was cancelled.`, "warning");
							return;
						}
					}
					pi.appendEntry("bloom-topic", {
						name,
						status: "active",
						branchPoint: target.branchPoint,
					});
					ctx.ui.notify(`Switched to topic: ${name}`, "info");
					break;
				}

				default: {
					ctx.ui.notify("Usage: /topic new <name> | close | list | switch <name>", "info");
					break;
				}
			}
		},
	});
}
