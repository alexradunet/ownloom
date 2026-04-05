import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

export type ChatEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string; input: string }
	| { type: "tool_result"; name: string; output: string }
	| { type: "done" }
	| { type: "error"; message: string };

export interface PiSessionBridgeOptions {
	cwd: string;
}

type MessageContentBlock = { type?: string; text?: string };

type MessageUpdateEvent = {
	type: "message_update";
	assistantMessageEvent?: { type?: string; delta?: string };
	message?: { content?: MessageContentBlock[] };
};

type ToolStartEvent = {
	type: "tool_execution_start";
	toolName?: string;
	args?: unknown;
};

type ToolEndEvent = {
	type: "tool_execution_end";
	toolName?: string;
	result?: unknown;
};

type AgentBoundaryEvent = { type: "agent_start" | "agent_end" };

type SessionEvent = MessageUpdateEvent | ToolStartEvent | ToolEndEvent | AgentBoundaryEvent;

type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

type SessionHandle = {
	session: PiSession;
	sessionManager: SessionManager;
};

export class PiSessionBridge {
	private sessionHandlePromise: Promise<SessionHandle> | null = null;
	private readonly textCursors = new Map<number, number>();

	constructor(private readonly opts: PiSessionBridgeOptions) {}

	private async createSessionHandle(): Promise<SessionHandle> {
		const sessionManager = SessionManager.inMemory(this.opts.cwd);
		const { session } = await createAgentSession({
			cwd: this.opts.cwd,
			sessionManager,
		});
		return { session, sessionManager };
	}

	private async getSessionHandle(): Promise<SessionHandle> {
		if (!this.sessionHandlePromise) {
			const sessionHandlePromise = this.createSessionHandle().catch((error: unknown) => {
				if (this.sessionHandlePromise === sessionHandlePromise) {
					this.sessionHandlePromise = null;
				}
				throw error;
			});
			this.sessionHandlePromise = sessionHandlePromise;
		}

		return this.sessionHandlePromise;
	}

	private static stringifyToolInput(value: unknown): string {
		return JSON.stringify(value ?? {});
	}

	private static stringifyToolOutput(value: unknown): string {
		if (typeof value === "string") {
			return value;
		}

		return JSON.stringify(value ?? "");
	}

	private normalizeMessageUpdate(event: MessageUpdateEvent): ChatEvent[] {
		if (event.assistantMessageEvent?.type === "text_delta" && event.assistantMessageEvent.delta) {
			return [{ type: "text", content: event.assistantMessageEvent.delta }];
		}

		const content = event.message?.content;
		if (!content) {
			return [];
		}

		const events: ChatEvent[] = [];
		for (const [index, block] of content.entries()) {
			if (block.type !== "text" || !block.text) {
				continue;
			}

			const previousLength = this.textCursors.get(index) ?? 0;
			const delta = block.text.slice(previousLength);
			if (!delta) {
				continue;
			}

			this.textCursors.set(index, block.text.length);
			events.push({ type: "text", content: delta });
		}

		return events;
	}

	async start(): Promise<void> {
		await this.getSessionHandle();
	}

	async reset(): Promise<void> {
		const currentHandlePromise = this.sessionHandlePromise;
		this.sessionHandlePromise = null;
		this.textCursors.clear();
		if (!currentHandlePromise) {
			return;
		}

		const { session, sessionManager } = await currentHandlePromise;
		sessionManager.newSession?.();
		session.dispose?.();
	}

	async stop(): Promise<void> {
		const currentHandlePromise = this.sessionHandlePromise;
		this.sessionHandlePromise = null;
		this.textCursors.clear();
		if (!currentHandlePromise) {
			return;
		}

		const { session } = await currentHandlePromise;
		session.dispose?.();
	}

	async *sendMessage(text: string): AsyncGenerator<ChatEvent> {
		const { session } = await this.getSessionHandle();
		const queue: ChatEvent[] = [];
		let done = false;
		let notify: (() => void) | null = null;

		const wake = () => {
			notify?.();
			notify = null;
		};

		const finish = () => {
			done = true;
			wake();
		};

		const unsubscribe = session.subscribe((event) => {
			const normalizedEvent = event as SessionEvent;
			switch (normalizedEvent.type) {
				case "agent_start":
					this.textCursors.clear();
					break;
				case "message_update":
					queue.push(...this.normalizeMessageUpdate(normalizedEvent));
					break;
				case "tool_execution_start":
					queue.push({
						type: "tool_call",
						name: normalizedEvent.toolName ?? "unknown",
						input: PiSessionBridge.stringifyToolInput(normalizedEvent.args),
					});
					break;
				case "tool_execution_end":
					queue.push({
						type: "tool_result",
						name: normalizedEvent.toolName ?? "unknown",
						output: PiSessionBridge.stringifyToolOutput(normalizedEvent.result),
					});
					break;
				case "agent_end":
					finish();
					break;
			}

			if (queue.length > 0) {
				wake();
			}
		});

		session
			.prompt(text)
			.then(() => {
				if (!done) {
					finish();
				}
			})
			.catch((error: unknown) => {
				queue.push({ type: "error", message: String(error) });
				finish();
			});

		try {
			while (!done || queue.length > 0) {
				if (queue.length === 0 && !done) {
					await new Promise<void>((resolve) => {
						notify = resolve;
					});
				}

				while (queue.length > 0) {
					yield queue.shift()!;
				}
			}
		} finally {
			unsubscribe();
		}

		yield { type: "done" };
	}
}
