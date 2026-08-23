# AI Virtual Terminal (/!terminal)

Give models a simulated Linux terminal with a persistent per-conversation virtual filesystem, so the AI can create, edit, zip and present files. No external sandbox or API key needed — the terminal is implemented inside the `chat` edge function.

## User-facing behavior

- Models with the terminal enabled can run commands like `ls`, `cat notes.txt`, `echo hello > a.txt`, `mkdir src`, `zip bundle.zip src/`, etc.
- Each terminal run shows as a collapsible ToolCard in chat (like /!csearch), with a terminal-styled output view, loading placeholder, error banner and retry.
- Files persist per conversation: the AI can keep working with them across messages.
- To hand a file to the user, the AI uses a new `/!present_fs_file <path>` command, which renders the existing downloadable file card — now with binary (zip) download support.

## Supported commands (whitelisted, simulated)

- `pwd`, `cd`, `ls`, `cat`, `echo`/`printf` (with `>` and `>>`), `touch`, `mkdir`, `rm`, `mv`, `cp`, `head`, `tail`, `wc`, `zip <out.zip> <paths...>`, `unzip -l <zip>`, `base64`, `help`
- Anything else returns `command not found` with the supported list.
- Safety limits: max ~25 files and ~256 KB per file per conversation; path traversal (`..`, absolute paths outside the sandbox root) is rejected.

## Technical plan

### 1. Database (one migration)
- New table `public.chat_files`: `id`, `conversation_id` (FK, cascade), `user_id`, `path` (text, unique per conversation), `content_base64`, `is_binary`, `size_bytes`, `created_at`, `updated_at`.
- GRANTs for `authenticated` + `service_role`, RLS enabled, owner-only policies (select/insert/update/delete where `auth.uid() = user_id`).
- `public.model_costs`: add `tool_terminal boolean not null default false`.
- `public.conversations`: add `terminal_cwd text not null default '/'` so `cd` persists between commands.

### 2. Edge function `chat` (main work)
- Virtual FS layer: load all `chat_files` rows for the conversation into memory at tool time, execute the command against it, write changed rows back (upsert/delete). `cd` updates `conversations.terminal_cwd`.
- Command interpreter in TypeScript: tokenizer (quotes, `>`, `>>`), path resolution against `terminal_cwd`, and per-command handlers. `zip` uses `jszip` (`npm:jszip`) to bundle files into a stored binary file.
- New tools wired into the existing loop:
  - `/!terminal <command>` — runs one command, returns stdout/stderr text.
  - `/!present_fs_file <path>` — server-side: reads the file and emits a `[[FILE]]` marker with `encoding: "base64"` for binary files (extends the existing present-file flow).
- Register both in `TOOL_RE`, `runTool`, the toolFlags (`tool_terminal`), and the system prompt instructions (with a short command cheat-sheet and guidance to zip-then-present for sharing files).
- Terminal commands are instant (no network), so no extra timeout handling needed.

### 3. Edge function `run-tool` (retry parity)
- Accept `conversationId` in the body and support retrying `terminal` commands against the same virtual FS (requires the conversation id; ChatMessage retry passes it through).

### 4. Admin Panel
- Add a "Terminal" toggle to the model tool toggles in `AdminPanel.tsx` / `FileEditor.tsx`, and add `tool_terminal` to `useModelCosts.ts` (type, select list, mapping). Default off, like the other tools.

### 5. Chat UI
- `ChatMessage.tsx`: terminal ToolCards get a Terminal icon and a monospace dark "terminal output" style for args/result (reuse the existing collapsible ToolCard, error banner, retry).
- Present-file card: support `encoding: "base64"` payloads so zips download as real binary files (decode base64 → Blob download).

### 6. Verify
- Typecheck/build, then chat with a terminal-enabled model: create files, list, zip, `cd` persistence across messages, present the zip, download it, and confirm the toggle off disables the tool.

## Notes
- This is a simulated terminal, not a real Linux VM — no arbitrary binaries, network access, or package installs. (A real sandbox via E2B is possible later if needed.)
- The terminal itself costs nothing extra; only the normal per-message credit applies.
