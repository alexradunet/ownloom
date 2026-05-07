# PI wiki adapter

PI-specific adapter for the shared `nixpi-wiki` core.

It provides PI registered tools from the shared `toolManifest`:

- `wiki_status`
- `wiki_search`
- `wiki_ensure_object`
- `wiki_daily`
- `wiki_ingest`
- `wiki_lint`
- `wiki_rebuild`
- `wiki_decay_pass`
- `wiki_session_capture`

The adapter also provides PI-only hooks/commands:

- `/memory` — show memory file sizes and paths.
- `/today` — quick daily briefing from wiki + planner.
- protected-path guard for direct writes to wiki `raw/` and `meta/proposals/`.
- memory file edit notifications.
- metadata rebuild after direct wiki Markdown edits.
- compaction context capture.

Shared wiki behavior belongs in `os/pkgs/nixpi-wiki`; this directory should remain adapter glue.
