import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedCreateAgentSession, mockedInMemory } = vi.hoisted(() => ({
	mockedCreateAgentSession: vi.fn(),
	mockedInMemory: vi.fn(() => ({ kind: "in-memory-session-manager" })),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	createAgentSession: mockedCreateAgentSession,
	SessionManager: {
		inMemory: mockedInMemory,
	},
}));

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { PiSessionBridge } from "../../core/chat-server/pi-session.js";

type EventListener = (event: Record<string, unknown>) => void;

function makeMockSession() {
	let listener: EventListener | null = null;
	return {
		subscribe: vi.fn((cb: EventListener) => {
			listener = cb;
			return () => {
				listener = null;
			};
		}),
		prompt: vi.fn(async (_text: string) => {
			listener?.({
				type: "message_update",
				assistantMessageEvent: { type: "text_delta", delta: "Hello" },
			});
			listener?.({
				type: "tool_execution_start",
				toolName: "read",
				args: { file: "README.md" },
			});
			listener?.({
				type: "tool_execution_end",
				toolName: "read",
				result: "# NixPI",
			});
			listener?.({ type: "agent_end" });
		}),
		dispose: vi.fn(),
	};
}

describe("PiSessionBridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("normalizes SDK events into chat events", async () => {
		const session = makeMockSession();
		mockedCreateAgentSession.mockResolvedValue({ session });

		const bridge = new PiSessionBridge({ cwd: "/tmp/cwd" });
		const events = [];
		for await (const event of bridge.sendMessage("hi")) {
			events.push(event);
		}

		expect(SessionManager.inMemory).toHaveBeenCalledOnce();
		expect(createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/tmp/cwd",
				sessionManager: expect.any(Object),
			}),
		);
		expect(events).toEqual([
			{ type: "text", content: "Hello" },
			{ type: "tool_call", name: "read", input: '{"file":"README.md"}' },
			{ type: "tool_result", name: "read", output: "# NixPI" },
			{ type: "done" },
		]);
	});
});
