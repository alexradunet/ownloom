import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

export function validateServiceName(name: string): string | null {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		return "Service name must be kebab-case using [a-z0-9-].";
	}
	return null;
}

export function validatePinnedImage(image: string): string | null {
	if (image.includes("@sha256:")) return null;
	const tagMatch = image.match(/:([^/@]+)$/);
	if (!tagMatch) {
		return "Image must include an explicit version tag or digest (avoid implicit latest).";
	}
	const tag = tagMatch[1].toLowerCase();
	if (tag === "latest" || tag.startsWith("latest-")) {
		return "Image tag must be pinned (avoid latest/latest-* tags).";
	}
	return null;
}

export function extractDigest(text: string): string | null {
	const match = text.match(/sha256:[a-f0-9]{64}/i);
	return match ? match[0].toLowerCase() : null;
}

export function hasSubidRange(filePath: string, username: string): boolean {
	if (!existsSync(filePath)) return false;
	try {
		return readFileSync(filePath, "utf-8")
			.split("\n")
			.some((line) => line.trim().startsWith(`${username}:`));
	} catch {
		return false;
	}
}

export function tailscaleRootlessPreflightError(): string | null {
	const user = os.userInfo().username;
	const hasSubuid = hasSubidRange("/etc/subuid", user);
	const hasSubgid = hasSubidRange("/etc/subgid", user);
	if (hasSubuid && hasSubgid) return null;

	return [
		`Rootless Podman prerequisite missing for user "${user}":`,
		`- /etc/subuid entry present: ${hasSubuid ? "yes" : "no"}`,
		`- /etc/subgid entry present: ${hasSubgid ? "yes" : "no"}`,
		"",
		"Fix (requires sudo), then log out and back in:",
		`sudo usermod --add-subuids 100000-165535 ${user}`,
		`sudo usermod --add-subgids 100000-165535 ${user}`,
	].join("\n");
}

export function tailscaleAuthConfigured(): boolean {
	const direct = process.env.TS_AUTHKEY?.trim();
	if (direct) return true;
	const envPath = join(os.homedir(), ".config", "bloom", "tailscale.env");
	if (!existsSync(envPath)) return false;
	try {
		const raw = readFileSync(envPath, "utf-8");
		return raw
			.split("\n")
			.some((line) => line.trim().startsWith("TS_AUTHKEY=") && line.trim().length > "TS_AUTHKEY=".length);
	} catch {
		return false;
	}
}

export function hasTagOrDigest(ref: string): boolean {
	if (ref.includes("@")) return true;
	const lastSlash = ref.lastIndexOf("/");
	const tail = ref.slice(lastSlash + 1);
	return tail.includes(":");
}
