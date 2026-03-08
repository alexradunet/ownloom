import { describe, expect, it, vi } from "vitest";
import { connect, disconnect, sendMessage } from "../src/transport.js";

describe("connect", () => {
	it("accepts an onMessage callback", async () => {
		const onMessage = vi.fn();
		await connect({ onMessage });
		// TODO: Trigger a message from the transport and verify onMessage is called.
		// Example:
		//   simulateIncomingMessage("sender-id", "hello");
		//   expect(onMessage).toHaveBeenCalledWith("sender-id", "hello");
		disconnect();
	});
});

describe("sendMessage", () => {
	it("does not throw for stub implementation", () => {
		// TODO: Replace with real send tests once transport is implemented.
		expect(() => sendMessage("recipient-id", "hello")).not.toThrow();
	});
});

describe("disconnect", () => {
	it("does not throw", () => {
		expect(() => disconnect()).not.toThrow();
	});
});
