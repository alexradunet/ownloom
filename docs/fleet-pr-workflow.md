# Fleet PR Workflow

> 📖 [Emoji Legend](LEGEND.md)

Bloom assumes the repo clone used for contribution lives at:

- `~/.bloom/pi-bloom`

The supported repo tools are:

- `bloom_repo`
- `bloom_repo_submit_pr`
- the `bloom-dev` PR helpers for pushing skills, services, and extensions

## Recommended Flow

1. authenticate GitHub on the device

```bash
gh auth login
gh auth status
```

2. configure the clone and remotes

```text
bloom_repo(action="configure", repo_url="https://github.com/pibloom/pi-bloom.git")
```

Optionally provide a fork:

```text
bloom_repo(action="configure", repo_url="https://github.com/pibloom/pi-bloom.git", fork_url="https://github.com/<you>/pi-bloom.git")
```

3. inspect status

```text
bloom_repo(action="status")
```

4. sync from upstream

```text
bloom_repo(action="sync", branch="main")
```

5. make and validate changes

```bash
cd ~/.bloom/pi-bloom
npm run build
npm run check
npm run test
```

6. submit a PR

```text
bloom_repo_submit_pr(title="docs: ...")
```

## Current Tool Behavior

### `bloom_repo`

Actions:

- `configure`
- `status`
- `sync`

Current repo assumptions:

- local path is `~/.bloom/pi-bloom`
- `upstream` is the canonical repo
- `origin` is the writable fork or alternative push target

### `bloom_repo_submit_pr`

Current behavior:

- confirms with the user
- verifies git and GitHub auth state
- can optionally stage all changes via `add_all=true`
- creates or switches to the target branch
- commits staged changes
- pushes to `origin`
- creates a PR against `upstream`

### `bloom-dev` PR helpers

`bloom-dev` also provides:

- `dev_submit_pr`
- `dev_push_skill`
- `dev_push_service`
- `dev_push_extension`

These operate on the same local repo clone under `~/.bloom/pi-bloom` after dev mode is enabled.

## Expectations

- do not push directly to `main`
- prefer fork + PR flow
- validate locally before opening a PR
- keep documentation aligned with the code you changed

## Related

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
