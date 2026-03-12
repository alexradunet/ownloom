/**
 * bloom-attach — connect to a running Pi room session via Unix socket.
 *
 * Usage:
 *   bloom-attach              # list available rooms
 *   bloom-attach general      # prefix-match and connect to room
 */
import { readdirSync } from "node:fs";
import { connect } from "node:net";
import os from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const SOCKET_DIR = join(process.env.XDG_RUNTIME_DIR ?? join(os.homedir(), ".run"), "bloom");
const PREFIX = "room-";
const SUFFIX = ".sock";

function listRooms(): string[] {
	try {
		return readdirSync(SOCKET_DIR)
			.filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
			.map((f) => f.slice(PREFIX.length, -SUFFIX.length));
	} catch {
		return [];
	}
}

function findRoom(query: string): string | null {
	const rooms = listRooms();
	const matches = rooms.filter((r) => r.startsWith(query));
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		console.error(`Multiple matches: ${matches.join(", ")}`);
		return null;
	}
	console.error(`No active session matching "${query}"`);
	return null;
}

function main(): void {
	const query = process.argv[2];

	if (!query) {
		const rooms = listRooms();
		if (rooms.length === 0) {
			console.log("No active room sessions.");
		} else {
			console.log("Active rooms:");
			for (const r of rooms) {
				console.log(`  ${r}`);
			}
		}
		process.exit(0);
	}

	const room = findRoom(query);
	if (!room) process.exit(1);

	const socketPath = join(SOCKET_DIR, `${PREFIX}${room}${SUFFIX}`);
	const client = connect(socketPath);

	client.on("connect", () => {
		console.log(`Connected to ${room}. Ctrl+C to interrupt Pi, Ctrl+D to disconnect.\n`);
	});

	client.on("error", (err) => {
		console.error(`Connection error: ${err.message}`);
		process.exit(1);
	});

	client.on("close", () => {
		console.log("\nDisconnected.");
		process.exit(0);
	});

	// Read JSON events from socket, render to terminal
	const socketRl = createInterface({ input: client });
	socketRl.on("line", (line) => {
		try {
			const event = JSON.parse(line) as { type: string; [key: string]: unknown };
			renderEvent(event);
		} catch {
			// ignore unparseable lines
		}
	});

	// Read user input, send as commands
	const inputRl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });

	let lastCtrlC = 0;

	inputRl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) {
			inputRl.prompt();
			return;
		}
		const cmd = JSON.stringify({ type: "prompt", message: trimmed });
		client.write(`${cmd}\n`);
		inputRl.prompt();
	});

	inputRl.on("SIGINT", () => {
		const now = Date.now();
		if (now - lastCtrlC < 1000) {
			// Double Ctrl+C → abort
			client.write(`${JSON.stringify({ type: "abort" })}\n`);
			console.log("\n[abort sent]");
		} else {
			// Single Ctrl+C → steer
			client.write(`${JSON.stringify({ type: "steer", message: "stop" })}\n`);
			console.log("\n[interrupt sent]");
		}
		lastCtrlC = now;
		inputRl.prompt();
	});

	inputRl.on("close", () => {
		// Ctrl+D
		client.end();
	});

	inputRl.prompt();
}

function renderEvent(event: { type: string; [key: string]: unknown }): void {
	if (event.type === "message_update") {
		const ame = event.assistantMessageEvent as { type: string; delta?: string; toolName?: string } | undefined;
		if (!ame) return;

		if (ame.type === "text_delta" && ame.delta) {
			process.stdout.write(ame.delta);
		} else if (ame.type === "toolcall_start" && ame.toolName) {
			process.stdout.write(`\n[tool: ${ame.toolName}]\n`);
		}
	} else if (event.type === "agent_end") {
		process.stdout.write("\n");
	}
}

main();
