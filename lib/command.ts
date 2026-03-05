import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

const execAsync = promisify(execFile);

export async function runCommand(
	cmd: string,
	args: string[],
	options?: { signal?: AbortSignal; cwd?: string },
): Promise<CommandResult> {
	try {
		const { stdout, stderr } = await execAsync(cmd, args, options);
		return { stdout: String(stdout), stderr: String(stderr), exitCode: 0 };
	} catch (err: unknown) {
		const e = err as { message: string; stderr?: string; code?: number };
		return {
			stdout: "",
			stderr: e.stderr ?? e.message,
			exitCode: e.code ?? 1,
		};
	}
}

export function commandMissingError(text: string): boolean {
	return /ENOENT|not found|No such file/i.test(text);
}

export function commandCheckArgs(cmd: string): string[] {
	switch (cmd) {
		case "oras":
			return ["version"];
		case "podman":
		case "systemctl":
			return ["--version"];
		default:
			return ["--version"];
	}
}

export async function commandExists(cmd: string, signal?: AbortSignal): Promise<boolean> {
	if (!/^[a-zA-Z0-9._+-]+$/.test(cmd)) return false;
	const check = await runCommand(cmd, commandCheckArgs(cmd), { signal });
	if (check.exitCode === 0) return true;
	return !commandMissingError(check.stderr || check.stdout);
}

export async function ensureCommand(name: string, args: string[], signal?: AbortSignal): Promise<string | null> {
	const check = await runCommand(name, args, { signal });
	if (check.exitCode === 0) return null;
	const output = `${check.stderr || ""}\n${check.stdout || ""}`;
	if (commandMissingError(output)) {
		return `Required command not found: ${name}`;
	}
	return null;
}
