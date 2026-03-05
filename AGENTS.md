# Pi Tooling

This project relies on **Pi Coding Agent** to avoid rebuilding a full AI stack in the application layer.

Official reference:
- https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent

## What Pi Is

Pi is a CLI coding agent (terminal) that:
- manages conversation sessions,
- selects a provider + model,
- executes tools (read/bash/edit/write, etc.),
- exposes useful commands such as `--list-models`.

In our local environment, the command used is:
- `bin/pi`

## How Pi Works (Practical View)

1. Pi loads user configuration from the detected configuration directory.
2. Pi builds the available model registry (providers + models).
3. Pi optionally applies a model **scope** via `enabledModels`.
4. Pi starts interactive mode or runs a one-shot command.

Important files:
- `models.json`: custom provider/model definitions.
- `settings.json`: global preferences, including `enabledModels` (scope).
- `bin/pi`: CLI binary/wrapper executed by the app.

## Scoped Models vs All Models

Pi distinguishes between:
- **All models**: what `pi --list-models` returns.
- **Scoped models**: subset defined in `settings.json > enabledModels`.

Model key convention in `enabledModels`:
- `provider/modelId`
- Example: `openai-codex/gpt-5.3-codex`

## Useful Commands

- List models:
  - `bin/pi --list-models`
- Run Pi in interactive mode:
  - `~/.pi/agent/bin/pi`
- Run a prompt and exit:
  - `bin/pi -p "your prompt"`

## Expected Integration in This Dashboard

- The selector displays **scoped** models by default.
- The `more` button displays **all** models.
- The star adds/removes a model from scope by actually updating:
  - `settings.json` -> `enabledModels`.

This behavior must remain the source of truth (no UI-only scope).

## Documentation Maintenance Rule

- Any change that impacts current behavior, user workflows, APIs, configuration, extension contracts, or technical architecture **must** include documentation updates in the same change.
- Documentation updates are mandatory, not optional.
- If behavior changes are shipped without doc updates, the change is considered incomplete.
- Primary documentation files to keep in sync:
  - `docs/CHATONS_USER_GUIDE.md`
  - `docs/CHATONS_DEVELOPER_GUIDE.md`
  - `docs/DOCUMENTATION_AUDIT.md` (when drift or limitations change)
