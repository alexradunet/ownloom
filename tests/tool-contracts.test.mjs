import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const osCoreSource = readFileSync("extensions/bloom-os-core.ts", "utf-8");
const fleetSource = readFileSync("extensions/bloom-fleet.ts", "utf-8");
const runtimeSource = readFileSync("extensions/bloom-runtime.ts", "utf-8");
const svcSource = readFileSync("extensions/bloom-services.ts", "utf-8");

test("bloom-os-core tool namespace uses os_ prefix", () => {
	const names = [...osCoreSource.matchAll(/name:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
	const toolNames = names.filter((n) => n.includes("_"));
	for (const name of toolNames) {
		assert.equal(name.startsWith("os_"), true, `unexpected bloom-os-core tool name: ${name}`);
	}
});

test("bloom-fleet tool namespace uses fleet_ prefix", () => {
	const names = [...fleetSource.matchAll(/name:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
	const toolNames = names.filter((n) => n.includes("_"));
	for (const name of toolNames) {
		assert.equal(name.startsWith("fleet_"), true, `unexpected bloom-fleet tool name: ${name}`);
	}
});

test("bloom-runtime tool namespace uses runtime_ prefix", () => {
	const names = [...runtimeSource.matchAll(/name:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
	const toolNames = names.filter((n) => n.includes("_"));
	for (const name of toolNames) {
		assert.equal(name.startsWith("runtime_"), true, `unexpected bloom-runtime tool name: ${name}`);
	}
});

test("bloom-services tool namespace uses svc_ prefix", () => {
	const names = [...svcSource.matchAll(/name:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
	const toolNames = names.filter((n) => n.includes("_"));
	for (const name of toolNames) {
		assert.equal(name.startsWith("svc_"), true, `unexpected bloom-services tool name: ${name}`);
	}
});
