// Extension-specific types for bloom-channels

import type { Socket } from "node:net";

/** State tracking for a connected channel bridge socket. */
export interface ChannelInfo {
	socket: Socket;
	connected: boolean;
	missedPings: number;
	pingTimer?: ReturnType<typeof setInterval>;
	pendingCount: number;
	rateBurst: number;
	rateTimer?: ReturnType<typeof setInterval>;
}

/** Context attached to a pending inbound channel message awaiting response. */
export interface ChannelContext {
	channel: string;
	from: string;
	createdAt: number;
}

/** Media attachment info for incoming channel messages. */
export interface MediaInfo {
	kind: string;
	mimetype: string;
	filepath: string;
	duration?: number;
	size: number;
	caption?: string;
}

/** Parsed incoming message from a channel bridge socket. */
export interface IncomingMessage {
	type: "register" | "message" | "pong" | "pairing";
	id?: string;
	channel: string;
	token?: string;
	from?: string;
	text?: string;
	timestamp?: number;
	media?: MediaInfo;
	data?: string;
}
