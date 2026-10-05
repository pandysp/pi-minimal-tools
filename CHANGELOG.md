# Changelog

## Unreleased

## 0.1.1

- Level 1 of Ctrl+O no longer hides finished calls without a trace: each run of tool calls becomes one summary line, such as `Ran 3 commands (2 failed), read 1 file`. Failed calls fold into it too. Your messages and the agent's text start a new line; a running call shows its own row until it finishes.

## 0.1.0

First release on npm: `pi install npm:pi-minimal-tools`. See the [README](README.md) for what it changes.

- Ctrl+O has three levels. A session starts at level 1, which hides finished, successful tool rows; level 2 shows the compact rows; level 3 is pi's full view.
- Every covered row is drawn through pi's renderer-only hook, so pi keeps execution, schemas and settings. Requires pi 1.0.3 or newer.
