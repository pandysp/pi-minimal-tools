# Changelog

## Unreleased

## 0.1.0

First release on npm: `pi install npm:pi-minimal-tools`. See the [README](README.md) for what it changes.

- Ctrl+O has three levels. A session starts at level 1, which hides finished, successful tool rows; level 2 shows the compact rows; level 3 is pi's full view.
- Every covered row is drawn through pi's renderer-only hook, so pi keeps execution, schemas and settings. Requires pi 1.0.3 or newer.
