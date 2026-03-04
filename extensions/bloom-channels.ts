import type { AgentEndEvent, ExtensionAPI, ExtensionContext, SessionShutdownEvent, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { createServer, Server, Socket } from "node:net";

interface ChannelInfo {
	socket: Socket;
	connected: boolean;
}

interface ChannelContext {
	channel: string;
	from: string;
}

interface IncomingMessage {
	type: "register" | "message";
	channel: string;
	from?: string;
	text?: string;
	timestamp?: number;
}

const PORT = parseInt(process.env["BLOOM_CHANNELS_PORT"] ?? "18800", 10);

export default function (pi: ExtensionAPI) {
	const channels = new Map<string, ChannelInfo>();
	let lastChannelContext: ChannelContext | null = null;
	let server: Server | null = null;
	let lastCtx: ExtensionContext | null = null;

	function updateWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const lines: string[] = [];
		for (const [name, info] of channels) {
			lines.push(`${name}: ${info.connected ? "connected" : "disconnected"}`);
		}
		if (lines.length > 0) {
			ctx.ui.setWidget("bloom-channels", lines);
		} else {
			ctx.ui.setWidget("bloom-channels", undefined);
		}
		ctx.ui.setStatus("bloom-channels", `Channels: ${channels.size} connected`);
	}

	function removeChannel(name: string): void {
		channels.delete(name);
		if (lastCtx) updateWidget(lastCtx);
	}

	function sendToSocket(socket: Socket, obj: object): void {
		socket.write(JSON.stringify(obj) + "\n");
	}

	function handleSocketData(socket: Socket, data: string): void {
		const lines = data.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			let msg: IncomingMessage;
			try {
				msg = JSON.parse(trimmed) as IncomingMessage;
			} catch {
				console.error("[bloom-channels] Failed to parse message:", trimmed);
				continue;
			}

			if (msg.type === "register") {
				const name = msg.channel;
				channels.set(name, { socket, connected: true });
				sendToSocket(socket, { type: "status", connected: true });
				if (lastCtx) updateWidget(lastCtx);
				console.log(`[bloom-channels] Channel registered: ${name}`);
			} else if (msg.type === "message") {
				const text = msg.text ?? "";
				const from = msg.from ?? "unknown";
				const channel = msg.channel;
				lastChannelContext = { channel, from };
				const prompt = `[${channel}: ${from}] ${text}`;
				if (lastCtx?.isIdle()) {
					pi.sendUserMessage(prompt);
				} else {
					pi.sendUserMessage(prompt, { deliverAs: "followUp" });
				}
			}
		}
	}

	pi.on("session_start", (_event: SessionStartEvent, ctx: ExtensionContext) => {
		lastCtx = ctx;
		server = createServer((socket: Socket) => {
			let buffer = "";

			socket.on("data", (chunk: Buffer) => {
				buffer += chunk.toString();
				const newlineIdx = buffer.lastIndexOf("\n");
				if (newlineIdx === -1) return;
				const complete = buffer.slice(0, newlineIdx + 1);
				buffer = buffer.slice(newlineIdx + 1);
				handleSocketData(socket, complete);
			});

			socket.on("error", (err: Error) => {
				console.error("[bloom-channels] Socket error:", err.message);
				// Remove any channel registered to this socket
				for (const [name, info] of channels) {
					if (info.socket === socket) {
						removeChannel(name);
						break;
					}
				}
			});

			socket.on("close", () => {
				for (const [name, info] of channels) {
					if (info.socket === socket) {
						removeChannel(name);
						console.log(`[bloom-channels] Channel disconnected: ${name}`);
						break;
					}
				}
			});
		});

		server.on("error", (err: Error) => {
			console.error("[bloom-channels] Server error:", err.message);
		});

		server.listen(PORT, "127.0.0.1", () => {
			console.log(`[bloom-channels] Listening on localhost:${PORT}`);
		});

		updateWidget(ctx);
	});

	pi.on("agent_end", (event: AgentEndEvent, ctx: ExtensionContext) => {
		lastCtx = ctx;
		if (!lastChannelContext) return;

		const { channel, from } = lastChannelContext;
		lastChannelContext = null;

		const channelInfo = channels.get(channel);
		if (!channelInfo) return;

		// Find last assistant message and extract text
		const messages = event.messages;
		let responseText = "";
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if ("role" in msg && msg.role === "assistant") {
				const content = (msg as { role: "assistant"; content: { type: string; text?: string }[] }).content;
				const textParts = content
					.filter((c) => c.type === "text" && c.text)
					.map((c) => c.text as string);
				responseText = textParts.join("");
				break;
			}
		}

		if (responseText) {
			sendToSocket(channelInfo.socket, {
				type: "response",
				channel,
				to: from,
				text: responseText,
			});
		}
	});

	pi.on("session_shutdown", (_event: SessionShutdownEvent, _ctx: ExtensionContext) => {
		if (server) {
			server.close();
			server = null;
		}
		for (const [, info] of channels) {
			info.socket.destroy();
		}
		channels.clear();
	});

	pi.registerCommand("wa", {
		description: "Send a message to WhatsApp",
		handler: async (args: string, ctx) => {
			const waChannel = channels.get("whatsapp");
			if (!waChannel) {
				ctx.ui.notify("WhatsApp not connected", "warning");
				return;
			}
			const msg = JSON.stringify({ type: "send", channel: "whatsapp", text: args }) + "\n";
			waChannel.socket.write(msg);
			ctx.ui.notify("Sent to WhatsApp", "info");
		},
	});

	// Topic state helpers

	interface TopicInfo {
		name: string;
		status: "active" | "closed";
		branchPoint: string | undefined;
	}

	function getTopics(): TopicInfo[] {
		if (!lastCtx) return [];
		const entries = lastCtx.sessionManager.getEntries();
		const topics = new Map<string, TopicInfo>();
		for (const entry of entries) {
			if (entry.type === "custom" && entry.customType === "bloom-topic") {
				const data = (entry as { type: "custom"; customType: string; data?: unknown }).data as
					| { name?: string; status?: string; branchPoint?: string }
					| undefined;
				if (data?.name) {
					topics.set(data.name, {
						name: data.name,
						status: (data.status as "active" | "closed") ?? "active",
						branchPoint: data.branchPoint,
					});
				}
			}
		}
		return Array.from(topics.values());
	}

	function getActiveTopic(): TopicInfo | null {
		const topics = getTopics();
		const active = topics.filter((t) => t.status === "active");
		return active.length > 0 ? (active[active.length - 1] ?? null) : null;
	}

	pi.registerCommand("topic", {
		description: "Manage conversation topics: /topic new <name> | close | list | switch <name>",
		handler: async (args: string, ctx) => {
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
					const active = getActiveTopic();
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
					const topics = getTopics();
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
					const topics = getTopics();
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
