# Addons

Addons let anyone extend the AI with new tools, without touching the app's code. An addon is a single `.caiaddon` file (a renamed `.zip`) that anyone can upload from the **Addons** page (`/addons`). Once installed, its tools can be called by the AI as `/!prefix:toolname`, the same way built-in tools like `/!terminal` or `/!web` work.

## Table of contents

- [How it works](#how-it-works)
- [The `.caiaddon` format](#the-caiaddon-format)
  - [`addon.json`](#addonjson)
  - [`tools.json`](#toolsjson)
  - [`tools/*.py`](#toolspy)
- [Calling addon tools](#calling-addon-tools)
- [Example: the `example` addon](#example-the-example-addon)
- [Installing, uninstalling, and deleting](#installing-uninstalling-and-deleting)
- [Sandboxing and limits](#sandboxing-and-limits)
- [Validation rules](#validation-rules)
- [Architecture reference](#architecture-reference)

## How it works

1. Someone uploads a `.caiaddon` file on `/addons`.
2. The `addons-manage` edge function unzips it, validates `addon.json` and `tools.json`, and stores everything in the database (the addon's metadata plus each tool script's source).
3. Uploading auto-installs the addon for the uploader. Anyone else can browse the marketplace at `/addons` and install it for themselves.
4. When a user with an installed addon chats with the AI, the AI's system prompt is extended with a description of that addon's tools (name, parameters, description).
5. If the AI's reply contains a line like `/!prefix:toolname some args`, the backend runs that tool's Python source in a sandbox and feeds the output back to the AI, which continues its response using that result.

Addons are **per-user**: installing one only affects your own conversations. Nobody else's chats are changed by your install/uninstall.

## The `.caiaddon` format

A `.caiaddon` is a zip archive with this layout:

```
my-addon.caiaddon
├── addon.json        (required)
├── tools.json         (optional — omit if the addon has no tools)
└── tools/
    ├── toolname.py
    └── another_tool.py
```

### `addon.json`

Describes the addon itself.

| Field          | Type   | Required | Notes                                                                 |
|----------------|--------|----------|------------------------------------------------------------------------|
| `id`           | string | ✅       | Unique identifier, e.g. reverse-DNS style (`com.example.myaddon`). Re-uploading with the same `id` updates your existing addon (only the original uploader can update it). |
| `name`         | string | ✅       | Display name shown in the marketplace.                                |
| `prefix`       | string | ✅       | Lowercase letters/numbers/underscore, starting with a letter, 2–24 chars. Must be globally unique — this is the `prefix` in `/!prefix:toolname`. |
| `version`      | string | –        | Free-form version string, shown as a badge.                           |
| `description`  | string | –        | Shown on the addon's card.                                            |
| `dependencies` | array  | –        | Informational list of `{"id": "other.addon.id"}`. Not currently enforced automatically — see [Architecture reference](#architecture-reference). |

```json
{
  "id": "example.this.is.an.example",
  "name": "Example",
  "prefix": "abc",
  "version": "1.0.0",
  "description": "A minimal example addon.",
  "dependencies": []
}
```

### `tools.json`

Declares the tools the addon adds. Omit this file entirely if the addon registers no tools.

```json
{
  "tools": [
    {
      "name": "example",
      "file": "example.py",
      "description": "Returns the word 'example'.",
      "parameters": [
        { "name": "number-of-texts", "type": "int", "required": false, "description": "How many times to repeat." }
      ]
    }
  ]
}
```

| Field         | Type    | Required | Notes                                                                |
|---------------|---------|----------|------------------------------------------------------------------------|
| `name`        | string  | ✅       | Lowercase letters/numbers/`-`/`_`, up to 40 chars. Must be unique within the addon. This becomes the `toolname` in `/!prefix:toolname`. |
| `file`        | string  | ✅       | Filename of the script inside `tools/` (e.g. `example.py`).           |
| `description` | string  | –        | Shown to the AI in its tool list, and on the addon's card.             |
| `parameters`  | array   | –        | List of `{name, type?, required?, description?}`, purely documentation for the AI — see [below](#toolspy). |

Up to 25 tools per addon.

### `tools/*.py`

Each tool is a plain Python script. Arguments typed after the tool name in chat are passed to the script positionally via `sys.argv` (index 0 is the script filename, same as running `python toolname.py arg1 arg2`):

```python
import sys

# sys.argv[0] == "example.py"
# sys.argv[1:] == whatever the AI typed after /!abc:example
args = sys.argv[1:]
print("example")
```

Whatever the script prints to stdout becomes the tool's result, which is fed back to the AI. There is no structured parameter parsing beyond `sys.argv` — if you declare `parameters` in `tools.json`, that's documentation for the AI (so it knows what to type), not a validated schema; your script should parse `sys.argv` itself (e.g. with `argparse`) and handle missing/malformed input gracefully.

## Calling addon tools

Once installed, the AI can call an addon's tool by including a line like this in its response:

```
/!prefix:toolname arg1 "arg with spaces" arg3
```

- Arguments are split on whitespace, with support for `"double"` and `'single'` quoted strings.
- The AI sees each installed addon's tools listed in its system prompt automatically — you don't need to tell it about them in the conversation.
- If the addon isn't installed for the current user, or the tool doesn't exist, the AI gets an error message back instead of a crash.

## Example: the `example` addon

**`addon.json`**
```json
{ "id": "example.this.is.an.example", "name": "Example", "prefix": "abc" }
```

**`tools.json`**
```json
{ "tools": [ { "name": "example", "file": "example.py", "description": "Returns example" } ] }
```

**`tools/example.py`**
```python
print("example")
```

Zip these three into `example.caiaddon`, upload it on `/addons`, then ask the AI to use `/!abc:example`. It will respond with `example`.

## Installing, uninstalling, and deleting

- **Install / Uninstall** — any signed-in user, from the addon's card on `/addons`. Affects only that user.
- **Delete** — removes the addon for everyone (cascades to all installs). Only the original uploader or an admin can do this.
- **Re-upload** — uploading a `.caiaddon` with an `id` you already own updates it in place (new tools, new description, etc.) and keeps existing installs.
- Addons are **not downloadable** by other users — installing gives you the ability to use its tools, not a copy of the package.

## Sandboxing and limits

- Scripts run inside the app's existing Python sandbox (Pyodide, the same one used by `/!terminal`) — no host filesystem or process access.
- Each tool call has a hard timeout (15 seconds).
- `.caiaddon` files are capped at 3 MB; each individual script is capped at 200 KB.
- Up to 25 tools per addon.

## Validation rules

Uploads are rejected (with a specific error message) if:

- `addon.json` is missing or not valid JSON.
- `id`, `name`, or `prefix` are missing/invalid, or `prefix` doesn't match `^[a-z][a-z0-9_]{1,23}$`.
- The `prefix` is already used by a *different* addon `id`.
- The `id` already belongs to a different uploader.
- `tools.json` is present but not valid JSON, or references a `tools/<file>` that isn't in the archive.
- A tool name is invalid (`^[a-z][a-z0-9_-]{0,39}$`, case-insensitive) or duplicated within the addon.
- Any single script exceeds 200 KB, or the archive exceeds 3 MB, or there are more than 25 tools.

## Architecture reference

For contributors working on this feature:

| Piece | Location | Purpose |
|---|---|---|
| DB schema | `supabase/migrations/20260902120000_add_addons.sql` | `addons`, `addon_tool_sources`, `user_addons` tables; `tool_addons` flag on `model_costs` |
| Shared runtime | `supabase/functions/_shared/addonTools.ts` | Loads a user's installed addons, builds the `/!prefix:tool` regex + system-prompt lines, executes a tool via the Python sandbox |
| Upload/manage API | `supabase/functions/addons-manage/index.ts` | `list`, `upload`, `install`, `uninstall`, `delete` actions |
| Chat integration | `supabase/functions/chat/index.ts` | Injects addon tool docs into the system prompt; detects and dispatches `/!prefix:tool` calls during generation |
| Retry support | `supabase/functions/run-tool/index.ts` | Re-runs a single addon tool call (used by the UI's retry button) |
| Frontend | `src/pages/Addons.tsx`, `src/hooks/useAddons.ts` | Marketplace UI: browse, upload, install/uninstall, delete |

**Known limitations / not yet implemented:**
- `dependencies` in `addon.json` are stored but not enforced — installing an addon does not automatically install or check for its declared dependencies.
- No download of the original `.caiaddon` package (by design, per current requirements).
- No versioning history — re-uploading overwrites the previous version's tools/sources in place.
- Per-model enablement (`tool_addons` on `model_costs`) is admin-controlled but defaults to `true`.
