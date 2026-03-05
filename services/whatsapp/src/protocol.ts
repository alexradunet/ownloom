export interface ChannelMessage {
	type: string;
	to?: string;
	text?: string;
}

export function mimeToExt(mime: string): string {
	const map: Record<string, string> = {
		"audio/ogg": "ogg",
		"audio/ogg; codecs=opus": "ogg",
		"audio/mpeg": "mp3",
		"audio/mp4": "m4a",
		"audio/wav": "wav",
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
		"image/gif": "gif",
		"video/mp4": "mp4",
		"video/3gpp": "3gp",
		"application/pdf": "pdf",
		"application/octet-stream": "bin",
	};
	return map[mime] ?? mime.split("/").pop() ?? "bin";
}

export function splitTcpBuffer(buffer: string): { lines: string[]; remainder: string } {
	const all = buffer.split("\n");
	const remainder = all.pop() ?? "";
	const lines = all.map((line) => line.trim()).filter(Boolean);
	return { lines, remainder };
}

export function isChannelMessage(val: unknown): val is ChannelMessage {
	return (
		typeof val === "object" &&
		val !== null &&
		"type" in val &&
		typeof (val as Record<string, unknown>).type === "string"
	);
}
