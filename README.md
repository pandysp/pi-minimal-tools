# pi-minimal-tools

Claude Code-style tool rows for [pi](https://pi.dev): the rows that matter stand out, the rest shrink to one line.

| Before (stock pi) | After |
|---|---|
| `$ cat notes.md` + the last 5 lines + `Took 0.0s` | `Read 1 file (ctrl+o to expand)` |
| Dedicated `grep`, `find` or `ls` + a result preview | `Searched for 1 pattern` or `Listed 1 directory` + `(ctrl+o to expand)` |
| `$ seq 1 20` + the last 5 lines + `Took 0.0s` | `⏺ $ seq 1 20` + the first 3 lines + `… +17 lines (ctrl+o to expand)` |
| `write run.sh` + the first 10 lines of the file | `⏺ write run.sh` + the first 3 lines + `… +37 lines (ctrl+o to expand)` |
| `codemode` + up to 10 lines of script | `⏺ codemode` + the first 2 lines of the script, then `…` |

- **Dedicated `grep`, `find` and `ls` tools** collapse to one grey summary line after success. Empty results collapse too. Limited or truncated results keep a yellow `[truncated]` at the start, even in narrow panes; Ctrl+O shows the original notices and results. Running calls keep stock pi’s drawing with a grey dot. Failures get a red dot and show the whole error without expanding.
- **Shell look-around commands** (a single `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `rg` or `find` inside the `bash` tool) collapse to one grey line: `Listed 1 directory`, `Read 1 file`, `Searched for 1 pattern`. The dedicated `read` tool stays unchanged.
- **Other shell commands** get a full row with the first 3 output lines. A written file shows its first 3 lines the same way.
- **Long commands are cut like in Claude Code:** at most 2 lines and 160 characters, then `…`.
- **codemode scripts are cut the same way.** The list of tool calls the script made and its output are drawn by stock pi, without pi's frame like all rows here.
- **Failures stand out with a red mark.** Failed bash, write and edit calls get a red dot and show their error in full; a `grep` or `rg` that simply found nothing is not a failure. A failed call inside a codemode script gets a red `✗` line; its error text is on Ctrl+O, as in stock pi.
- **Claude Code's dots:** green = succeeded, red = failed, grey = running, on bash, write, edit and codemode rows, plus a dot in front of agent replies that start with plain text.
- **Ctrl+O** shows pi's normal full view.

Only the display changes. The model gets exactly the same tools, instructions and results as without the extension, which the tests check against real pi. The dedicated `grep`, `find` and `ls` tools use pi’s renderer-only hook: their implementations are not replaced or activated.

## Install

```sh
pi install git:github.com/pandysp/pi-minimal-tools
```

Requires **pi 1.0.3 or newer**. Tested with pi 1.0.3, alongside `@gotgenes/pi-anthropic-auth` and `pi-hydra`.

## Good to know

- **Sorting is strict on purpose.** Pipes (`ls | head`), command lists (`ls; true`), redirects, `$…` and `{…}` always get a full row: the exit code only belongs to the last command, so an earlier failure could otherwise hide in a summary line.
- **In practice, summaries show up less than you might expect.** Models often chain commands (`cd … && git status && cat …`), and chains get a full row. See decision A29.
- **pi hides crashes in tool drawing code** and quietly shows only the tool name. This extension shows a red `pi-minimal-tools: drawing the … row failed: …` line instead. If you see one after a pi update, the extension needs updating.
- **Commands you type yourself** with `!` or `!!` keep pi's normal display: pi draws them with a separate component, which this extension leaves alone.
- **If another extension also takes over `bash`, `write`, `edit` or `codemode`**, pi uses the first one registered, without a warning. If pi's own codemode is switched off in settings, it stays off. For `grep`, `find` and `ls`, we wrap the next renderer in load order; Ctrl+O and error drawing delegate to it, including renderers from other extensions.

## Decisions

Why it looks this way, and where it deliberately differs from Claude Code: [docs/decisions.md](docs/decisions.md).

## Develop

```sh
npm install
npm run check   # types
npm test        # includes real-pi tests: they call the configured model and may take a few minutes
```

To test with a different configured model without changing your settings:

```sh
PI_TEST_MODEL=openai-codex/gpt-6.1-sol:low npm test
```

Comparison runs share one session identity, so even provider cache keys are compared unchanged.

The real-pi tests need `tmux` and send a few tiny requests to your configured model. For their own runs they switch off this checkout if it is installed (and, when run from a git worktree, the main checkout). Any other installed copy, e.g. one installed from GitHub, makes them stop with a clear error instead of measuring the wrong thing.
