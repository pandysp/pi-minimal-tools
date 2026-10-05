# pi-minimal-tools

Claude Code-style tool rows for [pi](https://pi.dev): the rows that matter stand out, the rest shrink to one line.

| Before (stock pi) | After |
|---|---|
| `$ cat notes.md` + the last 5 lines + `Took 0.0s` | `Read 1 file (ctrl+o to expand)` |
| Dedicated `grep`, `find` or `ls` + a result preview | `Searched for 1 pattern` or `Listed 1 directory` + `(ctrl+o to expand)` |
| `$ seq 1 20` + the last 5 lines + `Took 0.0s` | `⏺ $ seq 1 20` + the first 3 lines + `… +17 lines (ctrl+o to expand)` |
| `write run.sh` + the first 10 lines of the file | `⏺ write run.sh` + the first 3 lines + `… +37 lines (ctrl+o to expand)` |
| `codemode` + up to 10 lines of script | `⏺ codemode` + the first 2 lines of the script, then `…` |

- **Dedicated `grep`, `find` and `ls` tools** are one grey summary line from the start: `Searching for 1 pattern…` while they run, `Searched for 1 pattern` once done. Empty results collapse too. Limited or truncated results keep a yellow `[truncated]` at the start, even in narrow panes; Ctrl+O shows the original notices and results. Running calls keep stock pi’s drawing with a grey dot. Failures get a red dot and show the whole error without expanding.
- **Shell look-around commands** (a single `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `rg` or `find` inside the `bash` tool) are one grey line from the start: `Listing 1 directory…`, `Reading 1 file…` or `Searching for 1 pattern…` while they run, then `Listed 1 directory`, `Read 1 file` or `Searched for 1 pattern`. The dedicated `read` tool stays unchanged.
- **Other shell commands** get a full row with the first 3 output lines. A written file shows its first 3 lines the same way.
- **Long commands are cut like in Claude Code:** at most 2 lines and 160 characters, then `…`.
- **codemode scripts are cut the same way.** The list of tool calls the script made and its output are drawn by stock pi, without pi's frame like all rows here.
- **Failures stand out with a red mark.** Failed bash calls keep their 3-line output preview, with full output on Ctrl+O. Failed write and edit calls keep stock pi’s error drawing. A shell `grep` or `rg` that simply found nothing is not a failure. A failed call inside a codemode script gets a red `✗` line; its error text is on Ctrl+O, as in stock pi.
- **Claude Code's dots:** green = succeeded, red = failed, grey = running, on bash, write, edit and codemode rows.
- **Ctrl+O has three levels.** A session starts at level 1: each run of tool calls becomes one line, such as `▸ Ran 3 commands (2 failed), read 1 file (ctrl+o to expand)`: a grey line with a grey ▸, and only the failed count in red. Your messages and the agent's text start a new line; its thinking does not. The latest call keeps its own row until the next call, text or reply starts to appear, so you see what the agent just did. Click a summary line to open its group: the ▸ turns into ▾ and the rows show below it, indented, as at level 2; a second click closes it. Ctrl+O moves to level 2, the rows described above, then to level 3, pi's normal full view, then back to level 1.

Only the display changes. Pi keeps ownership of execution, settings, schemas and codemode’s stored values. The covered tools use pi’s renderer-only hook: their implementations are not replaced or activated. The model gets exactly the same tools, instructions and results as without the extension, which the tests check against real pi.

## Install

```sh
pi install npm:pi-minimal-tools
```

Requires **pi 1.0.3 or newer**. Tested with pi 1.0.3, alongside `@gotgenes/pi-anthropic-auth` and `pi-hydra`.

## Good to know

- **Sorting is strict on purpose.** Pipes (`ls | head`), command lists (`ls; true`), redirects, `$…` and `{…}` always get a full row: the exit code only belongs to the last command, so an earlier failure could otherwise hide in a summary line.
- **In practice, summaries show up less than you might expect.** Models often chain commands (`cd … && git status && cat …`), and chains get a full row. See decision A29.
- **pi hides crashes in tool drawing code** and quietly shows only the tool name. This extension shows a red `pi-minimal-tools: drawing the … row failed: …` line instead. If you see one after a pi update, the extension needs updating.
- **Commands you type yourself** with `!` or `!!` keep pi's normal display: pi draws them with a separate component, which this extension leaves alone.
- **Other extensions keep ownership of their tools.** We wrap the next renderer in load order rather than rebuilding its tool. Drawing delegated to stock pi, including Ctrl+O, uses that next renderer. Disabled tools and extensions stay disabled.
- **Some rows stay visible at level 1.** Tools that come without their own drawing code (pi draws them in its generic grey box) keep their row and start a new summary line after them, because pi does not let extensions reuse that drawing. Pictures from an image read stay as well; pi draws them outside the row.
- **Level 1 hides `Thinking...` once the agent goes on.** As soon as the same message shows text or a tool call, its `Thinking...` line goes, with no blank line left behind; the thinking still in progress stays, like the latest call. Levels 2 and 3 show it as before, and thinking you show in full with Ctrl+T stays visible. pi offers no way to do this, so the extension hands pi's message row a copy of the message without the thinking (the row, the model and the saved session keep it). That leans on how pi 1.0.3 draws messages: if a pi update removes what the extension relies on, the session starts with a red error instead of quietly showing `Thinking...` again, and the real-pi tests catch other changes.
- **Switching sessions** (`/resume`, `/reload`) starts at level 1 again, or at level 3 if pi was expanded.

## Decisions

Why it looks this way, and where it deliberately differs from Claude Code: [docs/decisions.md](docs/decisions.md).

## Develop

```sh
npm install
npm run check       # types
npm run test:unit   # what CI runs on every push and pull request
npm test            # everything, including real-pi tests: they need tmux and a model, and may take a few minutes
```

A change users notice gets an entry under `Unreleased` in [CHANGELOG.md](CHANGELOG.md), in the same change.

## Releasing

Pushing a `v<version>` tag makes GitHub Actions publish to npm, with a provenance record and no token. CI cannot run the real-pi tests, so run them before you release.

1. Run `npm test` locally, real-pi tests included. All must pass.
2. Move the `Unreleased` entries in `CHANGELOG.md` under the new version, set the same version in `package.json` and `package-lock.json`, and merge that to `main`.
3. Tag the merge commit and push the tag: `git tag v<version> && git push origin v<version>`.
4. The `publish` job checks that the tag matches `package.json`, runs the checks, and publishes. `npm view pi-minimal-tools _npmUser` should then name GitHub Actions.
