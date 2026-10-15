# Environment Variables

The **Env** page keeps environment variables in named sets - one per place a
project runs, such as `production`, `staging`, or `local`. A key is unique
within its set, so the same `DATABASE_URL` can hold a different value in
staging and production.

## Projects

A set is filed under a project - the same projects the clipboard history uses -
or under none. The list groups sets by project, and a set's name is unique only
within its project, so `acme-api` and `billing` can each have a `production`.
**New set** starts in the project of the set on screen; its **Project** field
can pick another, **No project**, or **New project…** to make one there and
then. **Edit** moves a set between projects; **Duplicate** keeps the copy in
the same project. Sets made before projects existed start unfiled.

## Values

A value is any text and is stored exactly as typed, without trimming:

- a single value: `8080`, `postgres://localhost:5432/app`
- several lines: a PEM certificate or private key
- a JSON object or array, which the editor can format or minify and the list
  marks with a **JSON** badge

Keys may not contain spaces, `=`, or control characters, may not start with
`#` (a `.env` line starting with `#` is a comment, so such a key could never be
read back), and are at most 256 characters. Anything else is accepted - `server.port` and `ProgramFiles(x86)`
are real variables - but a key that is not a shell identifier (letters,
digits, and `_`, not starting with a digit) is marked **Not portable**, because
`export` cannot set it.

## Import

**Import…** reads pasted text, a file, or the clipboard, shows what it found,
and writes nothing until **Import** is pressed. Lines it cannot read are listed
by number in the preview and left out; a quote that never closes is reported on
its own line, and the lines after it are still read. The import itself is one
transaction: if the database refuses any entry, the set is left as it was.

- `.env`: `KEY=value` lines, `#` comments, blank lines, and single, double, or
  backtick quotes that may span lines. Double quotes understand `\n`, `\t`,
  `\"`, and `\\`; inside single quotes, a quote written as `'\''` (POSIX
  shells) or `''` (PowerShell) is read as one. The `export`, `set`, `$env:`,
  and `${env:…}` prefixes and `KEY: value` lines are accepted too, so
  SnipDock's own `.env`, Shell, PowerShell, and YAML output reads back in with
  its values intact.
- JSON: an object of `{"KEY": value}`, or an array of
  `{"name": ..., "value": ...}` (or `"key"`) as ECS task definitions and most
  hosting dashboards export. Numbers keep the text they were written with
  (`1.10` stays `1.10`, a 20-digit ID keeps every digit), booleans become
  their text, `null` becomes empty, and nested objects or arrays are kept as
  compact JSON.

A key given twice keeps its last value. A key the set already has is skipped
unless **Replace values for keys this set already has** is ticked. Replacing a
value can mark it secret but never unmarks it.

## Copy

Each row copies its value, or a `KEY=value` line. **Copy set as** copies the
whole set as:

| Format | Shape |
| --- | --- |
| .env | `KEY=value`, quoted only when needed |
| JSON | one object, two-space indent |
| Shell | `export KEY='value'` for bash and zsh; a key that is not a shell name is left out as a comment line |
| PowerShell | `$env:KEY = 'value'` |
| YAML | `KEY: "value"`, for Compose `environment:` or a Kubernetes ConfigMap |

Deleting a variable can be undone from the notice that follows; Undo puts it
back in the same place in its set. An empty value has nothing to put on the
clipboard, so copying one says so.

SnipDock marks these writes as its own, so the clipboard monitor does not file
them into the history: a value kept out of the history on purpose does not
reach it by being copied.

## Secrets

Keys and values that look secret (`TOKEN`, `SECRET`, `PASSWORD`, `API_KEY`,
`…_KEY`, `DSN`, a URL carrying a password, a PEM block) are marked secret when
added or imported; the switch in the editor and the boxes in the import preview
override the guess. A secret value is not in the page until revealed, and the
filter never matches on it.

Marking a value secret masks it; it does not encrypt it. Variables are stored in
the local database with the rest of SnipDock's data, travel inside encrypted
backups, and are never part of history exports. See the
[privacy model](privacy.md).
