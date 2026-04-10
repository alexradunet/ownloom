import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../core/lib/exec.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const bootstrapScriptPath = path.join(repoRoot, "core/scripts/nixpi-bootstrap-host.sh");

function createBootstrapHarness(options?: {
	preseedFlake?: boolean;
	omitConfiguration?: boolean;
	omitHardwareConfiguration?: boolean;
}) {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "nixpi-bootstrap-host-test-"));
	const etcNixosDir = path.join(rootDir, "etc/nixos");
	const rebuildArgsPath = path.join(rootDir, "nixos-rebuild.args");
	const rebuildStubPath = path.join(rootDir, "fake-nixos-rebuild.sh");

	fs.mkdirSync(etcNixosDir, { recursive: true });
	if (!options?.omitConfiguration) {
		fs.writeFileSync(path.join(etcNixosDir, "configuration.nix"), "{ ... }: {}\n");
	}
	if (!options?.omitHardwareConfiguration) {
		fs.writeFileSync(path.join(etcNixosDir, "hardware-configuration.nix"), "{ ... }: {}\n");
	}
	fs.writeFileSync(
		rebuildStubPath,
		`#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "$NIXPI_TEST_REBUILD_ARGS_FILE"
`,
	);
	fs.chmodSync(rebuildStubPath, 0o755);

	if (options?.preseedFlake) {
		fs.writeFileSync(
			path.join(etcNixosDir, "flake.nix"),
			`{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  outputs = { nixpkgs, ... }: {
    nixosConfigurations.nixos = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [ ./configuration.nix ];
    };
  };
}
`,
		);
	}

	return {
		rootDir,
		etcNixosDir,
		rebuildArgsPath,
		rebuildStubPath,
		cleanup() {
			fs.rmSync(rootDir, { recursive: true, force: true });
		},
	};
}

async function runBootstrap(
	args: string[],
	options?: {
		preseedFlake?: boolean;
		omitConfiguration?: boolean;
		omitHardwareConfiguration?: boolean;
	},
) {
	const harness = createBootstrapHarness(options);
	const result = await run("bash", [bootstrapScriptPath, ...args], undefined, repoRoot, {
		NIXPI_BOOTSTRAP_ROOT: harness.etcNixosDir,
		NIXPI_NIXOS_REBUILD: harness.rebuildStubPath,
		NIXPI_TEST_REBUILD_ARGS_FILE: harness.rebuildArgsPath,
		TMPDIR: harness.rootDir,
	});

	return {
		...result,
		readEtcNixosFile(relativePath: string) {
			return fs.readFileSync(path.join(harness.etcNixosDir, relativePath), "utf8");
		},
		rebuildArgs() {
			if (!fs.existsSync(harness.rebuildArgsPath)) return [];
			return fs.readFileSync(harness.rebuildArgsPath, "utf8").split("\0").filter(Boolean);
		},
		cleanup() {
			harness.cleanup();
		},
	};
}

describe("nixpi-bootstrap-host.sh", () => {
	it("generates a minimal host flake and helper files on a classic /etc/nixos tree", async () => {
		const result = await runBootstrap([
			"--primary-user",
			"alex",
			"--ssh-allowed-cidr",
			"198.51.100.10/32",
			"--hostname",
			"bloom-eu-1",
			"--timezone",
			"Europe/Bucharest",
			"--keyboard",
			"us",
		]);

		try {
			expect(result.exitCode).toBe(0);
			expect(result.readEtcNixosFile("flake.nix")).toContain("./hardware-configuration.nix");
			expect(result.readEtcNixosFile("flake.nix")).toContain('inputs.nixpi.url = "github:alexradunet/nixpi"');
			expect(result.readEtcNixosFile("flake.nix")).toContain("./nixpi-integration.nix");
			expect(result.readEtcNixosFile("nixpi-integration.nix")).toContain("nixpi.nixosModules.nixpi");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('networking.hostName = "bloom-eu-1";');
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain("nixpi.bootstrap.enable = true;");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('nixpi.primaryUser = "alex";');
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('nixpi.timezone = "Europe/Bucharest";');
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('nixpi.keyboard = "us";');
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain("nixpi.security.ssh.allowedSourceCIDRs = [");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('"198.51.100.10/32"');
			expect(result.rebuildArgs()).toEqual(["switch", "--flake", "/etc/nixos#nixos", "--impure"]);
		} finally {
			result.cleanup();
		}
	});

	it("writes helper files but refuses to rewrite an existing flake host", async () => {
		const result = await runBootstrap(["--primary-user", "alex", "--ssh-allowed-cidr", "198.51.100.10/32"], {
			preseedFlake: true,
		});

		try {
			expect(result.exitCode).toBe(0);
			expect(result.readEtcNixosFile("nixpi-integration.nix")).toContain("nixpi.nixosModules.nixpi");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain("nixpi.bootstrap.enable = true;");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('nixpi.primaryUser = "alex";');
			expect(result.stdout).toContain("Manual integration required");
			expect(result.stdout).toContain('inputs.nixpi.url = "github:alexradunet/nixpi"');
			expect(result.stdout).toContain("./nixpi-integration.nix");
			expect(result.stdout).toContain("sudo nixos-rebuild switch --flake /etc/nixos#nixos --impure");
			expect(result.rebuildArgs()).toEqual([]);
		} finally {
			result.cleanup();
		}
	});

	it("defaults the generated hostname to nixos when no hostname is provided", async () => {
		const result = await runBootstrap(["--primary-user", "alex", "--ssh-allowed-cidr", "198.51.100.10/32"]);

		try {
			expect(result.exitCode).toBe(0);
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain('networking.hostName = "nixos";');
			expect(result.rebuildArgs()).toEqual(["switch", "--flake", "/etc/nixos#nixos", "--impure"]);
		} finally {
			result.cleanup();
		}
	});

	it("generates a complete minimal configuration when configuration.nix is missing", async () => {
		const result = await runBootstrap(["--primary-user", "alex", "--ssh-allowed-cidr", "198.51.100.10/32"], {
			omitConfiguration: true,
		});

		try {
			expect(result.exitCode).toBe(0);
			expect(result.readEtcNixosFile("configuration.nix")).toContain('system.stateVersion = "25.05";');
			expect(result.readEtcNixosFile("configuration.nix")).toContain('    "nix-command"');
			expect(result.readEtcNixosFile("configuration.nix")).toContain('    "flakes"');
			expect(result.readEtcNixosFile("configuration.nix")).toContain("networking.firewall.allowedTCPPorts = [ 22 ];");
			expect(result.readEtcNixosFile("configuration.nix")).toContain("services.qemuGuest.enable = lib.mkDefault true;");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain("nixpi.security.ssh.allowedSourceCIDRs = [");
			expect(result.readEtcNixosFile("flake.nix")).toContain("./hardware-configuration.nix");
		} finally {
			result.cleanup();
		}
	});

	it("fails early when hardware-configuration.nix is unavailable", async () => {
		const result = await runBootstrap(["--primary-user", "alex", "--ssh-allowed-cidr", "198.51.100.10/32"], {
			omitHardwareConfiguration: true,
		});

		try {
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("hardware-configuration.nix is required");
		} finally {
			result.cleanup();
		}
	});

	it("installs an authorized key for the primary user when provided", async () => {
		const result = await runBootstrap([
			"--primary-user",
			"alex",
			"--ssh-allowed-cidr",
			"198.51.100.10/32",
			"--authorized-key",
			"ssh-ed25519 AAAATESTKEY user@test",
		]);

		try {
			expect(result.exitCode).toBe(0);
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain("users.users.alex.openssh.authorizedKeys.keys");
			expect(result.readEtcNixosFile("nixpi-host.nix")).toContain("AAAATESTKEY");
		} finally {
			result.cleanup();
		}
	});

	it("fails early when no SSH allowlist CIDR is provided", async () => {
		const result = await runBootstrap(["--primary-user", "alex"]);

		try {
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("At least one --ssh-allowed-cidr value is required.");
		} finally {
			result.cleanup();
		}
	});
});
