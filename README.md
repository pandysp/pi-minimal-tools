# pi-minimal-tools

Claude Code-style tool rows for [pi](https://pi.dev): the rows that matter stand out, the rest shrink to one line.

| Before (stock pi) | After |
|---|---|
| `$ cat notes.md` + the last 5 lines + `Took 0.0s` | `Read 1 file (ctrl+o to expand)` |
| `$ seq 1 20` + the last 5 lines + `Took 0.0s` | `⏺ $ seq 1 20` + the first 3 lines + `… +17 lines (ctrl+o to expand)` |

- **Look-around commands** (a single `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `rg` or `find`) collapse to one grey line: `Listed 1 directory`, `Read 1 file`, `Searched for 1 pattern`.
- **Everything else** gets a full row with the first 3 output lines.
- **Failures are always shown in full**, with a red dot. A `grep` or `rg` that simply found nothing is not a failure.
- **Claude Code's dots:** green = succeeded, red = failed, grey = running, on bash, write and edit rows, plus a dot in front of agent replies that start with plain text.
- **Ctrl+O** shows pi's normal full view.

Only the display changes. The model gets exactly the same tools, instructions and results as without the extension, which the tests check against real pi.

## Install

```sh
pi install git:github.com/pandysp/pi-minimal-tools
```

Tested with pi 0.87.1, alongside `@gotgenes/pi-anthropic-auth` and `pi-hydra`.

## Good to know

- **Sorting is strict on purpose.** Pipes (`ls | head`), command lists (`ls; true`), redirects, `$…` and `{…}` always get a full row: the exit code only belongs to the last command, so an earlier failure could otherwise hide in a summary line.
- **In practice, summaries show up less than you might expect.** Models often chain commands (`cd … && git status && cat …`), and chains get a full row. See decision A29.
- **pi hides crashes in tool drawing code** and quietly shows only the tool name. This extension shows a red `pi-minimal-tools: drawing the … row failed: …` line instead. If you see one after a pi update, the extension needs updating.
- **Commands you type yourself** with `!` or `!!` keep pi's normal display: pi draws them with a separate component, which this extension leaves alone.
- **If another extension also takes over `bash`, `write` or `edit`**, pi uses the first one registered, without a warning.

## Decisions

Why it looks this way, and where it deliberately differs from Claude Code: [docs/decisions.md](docs/decisions.md).

## Develop

```sh
npm install
npm run check   # types
npm test        # includes real-pi tests: they call the configured model and take about a minute
```
