# Changelog

## Unreleased

## 0.1.5

- Level 1 hides the agent's `Thinking...` once the same message goes on with text or a tool call, without leaving a blank line. The thinking still in progress stays visible, like the latest call. Levels 2 and 3 are unchanged. If a pi update removes what this relies on, the session starts with an error.

## 0.1.4

- Searches, listings and reads (the `grep`, `find` and `ls` tools, and a single `ls`, `cat`, `grep` and the like in bash) show their grey summary line from the start, like Claude Code: `Searching for 1 pattern…` while running, `Searched for 1 pattern` once done. Before, pi's own line switched to the summary the moment the call finished. A failure still turns into the full red row.

## 0.1.3

- The latest call now folds in the same moment the next call or text appears. Before, both showed together for a moment.
- The level-1 summary line looks like a heading: grey text with a grey ▸, which turns into ▾ when you click it open, and the opened rows are indented below it. Only the failed count is red; one failed call no longer turns the whole line red.
- Removed the dot in front of the agent's replies.

## 0.1.2

- At level 1 the latest call keeps its own row until the next call, text or reply arrives. Before, a call folded the moment it finished, so for the seconds the model spent on its next call, nothing showed what had just happened.
- A click on a level-1 summary line opens its group: the rows show below it, as at level 2. A second click closes it.

## 0.1.1

- Level 1 of Ctrl+O no longer hides finished calls without a trace: each run of tool calls becomes one summary line, such as `Ran 3 commands (2 failed), read 1 file`. Failed calls fold into it too. Your messages and the agent's text start a new line; a running call shows its own row until it finishes.

## 0.1.0

First release on npm: `pi install npm:pi-minimal-tools`. See the [README](README.md) for what it changes.

- Ctrl+O has three levels. A session starts at level 1, which hides finished, successful tool rows; level 2 shows the compact rows; level 3 is pi's full view.
- Every covered row is drawn through pi's renderer-only hook, so pi keeps execution, schemas and settings. Requires pi 1.0.3 or newer.
