# Softmark

Markdown previewer for the terminal. Opens `.md` files as a formatted HTML preview or sends them to the Claude AI artifact viewer — all from your terminal, without leaving your workflow.

Three modes:

| Mode | Command | What it does |
|------|---------|-------------|
| **Rendered view** | `softmark file.md` | Renders markdown as styled HTML in a browser pane |
| **AI review** | `softmark --ai file.md` | Copies content to clipboard + opens the Claude artifact viewer |
| **Open viewer** | `softmark --open` | Opens the Claude artifact viewer (no file — pin it to your browser) |

---

## Requirements

- macOS (uses `pbcopy` for clipboard)
- `python3` (pre-installed on macOS)
- `bash`

Optional (for in-terminal browser pane):
- [cmux](https://github.com/rigogsilva/cmux) — opens the preview in a split pane inside your terminal

---

## Install

```bash
# 1. Copy the script
cp softmark.sh ~/.local/bin/softmark
chmod +x ~/.local/bin/softmark

# 2. Make sure ~/.local/bin is in your PATH
#    Add this to your ~/.zshrc or ~/.bashrc if needed:
export PATH="$HOME/.local/bin:$PATH"
```

No configuration needed — the default artifact URL is hardcoded and works out of the box.

> **Optional:** Run `softmark --config` to point to your own published artifact instead of the default one.

---

## Usage

### Rendered view — opens formatted HTML preview

```bash
softmark path/to/file.md
```

### AI review mode — copy to clipboard + open Claude artifact

```bash
softmark --ai path/to/file.md
```

Copies the file content to your clipboard, then opens the Claude artifact viewer. Paste the content there for an AI-assisted review session.

### Open viewer — open the artifact without a file

```bash
softmark --open
```

Opens the Claude artifact viewer directly with no file. Useful for pinning it to your browser as a persistent tab for quick paste-and-review sessions.

Or open it directly: **[Softmark AI Viewer →](https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480)**

### Force open in default browser (skip cmux)

```bash
softmark --browser path/to/file.md
```

---

## Terminal vs cmux behavior

### Regular terminal (no cmux)

All modes fall back to `open` (macOS default browser):

```bash
softmark file.md          # → opens rendered preview in default browser
softmark --ai file.md     # → opens Claude artifact in default browser
softmark --open           # → opens Claude artifact in default browser
```

### Inside cmux

When running inside a [cmux](https://github.com/rigogsilva/cmux) session (`$CMUX_SURFACE_ID` is set), Softmark opens a browser pane split in your current workspace:

```bash
softmark file.md          # → rendered preview in cmux browser split pane
softmark --ai file.md     # → Claude artifact in cmux pane (paste content there)
softmark --open           # → Claude artifact in cmux pane (pin it, reuse anytime)
```

No extra configuration needed — cmux detection is automatic.

---

## Updating the artifact

The Claude artifact viewer (`softmark --open` / `--ai`) is a published Claude artifact. To update it:

1. **Edit `softmark.sh`** in this repo — the embedded HTML renderer is in the heredoc block
2. **Ask Claude to update the artifact** — open the existing artifact URL, paste the new HTML, and ask Claude to republish it
3. **Check if the link changed** — Claude may generate a new artifact URL when republishing
   - If the URL is the **same**: no action needed
   - If the URL **changed**: update the hardcoded default in `softmark.sh`:
     ```bash
     # Line ~40 in softmark.sh
     SOFTMARK_AI_URL="${SOFTMARK_AI_URL:-https://claude.ai/public/artifacts/NEW-URL-HERE}"
     ```
4. **Commit and reinstall**:
   ```bash
   git add softmark.sh && git commit -m "update: new artifact URL"
   cp softmark.sh ~/.local/bin/softmark
   ```

Current artifact: `https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480`

---

## Claude Code integration

To have Claude automatically use Softmark when you ask it to open or review `.md` files, add this to your `~/.claude/CLAUDE.md`:

```markdown
## Markdown Viewer (Softmark)

When the user asks to view, open, or review a `.md` file, use `softmark` from the terminal.
Binary: `~/.local/bin/softmark`

Two modes:

- **Rendered view** — opens the file as a formatted HTML preview in a cmux browser pane:
  ```bash
  softmark path/to/file.md
  ```
- **AI review mode** — copies file content to clipboard and opens the Claude artifact viewer in a cmux browser pane (user pastes content there):
  ```bash
  softmark --ai path/to/file.md
  ```

Always prefer `softmark` over printing raw markdown to the terminal when the user wants to read or review a file.
```

---

## Configuration

Config is stored at `~/.config/softmark/config`:

```bash
# Softmark config
SOFTMARK_AI_URL="https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480"
```

You can edit it directly or run `softmark --config` to use the interactive wizard.

---

## License

MIT
