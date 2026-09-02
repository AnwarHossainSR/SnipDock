# Keyboard Shortcuts

Default shortcuts:

- Open Quick Paste: `CmdOrCtrl+Shift+V` — works system-wide, even while another app has focus
- Focus main-window search: `CmdOrCtrl+Shift+F`
- Copy selected: `CmdOrCtrl+Shift+C`
- Toggle pin: `CmdOrCtrl+Shift+P`
- Delete selected: `CmdOrCtrl+Shift+Backspace`
- Toggle favorite: `CmdOrCtrl+Shift+D`
- Navigate next: `CmdOrCtrl+Shift+Right`
- Navigate previous: `CmdOrCtrl+Shift+Left`

Quick Paste opens above the currently focused application. Type to filter clipboard history, then use `Up`/`Down`, `Home`, or `End` to select an item. The first nine rows are numbered: `Ctrl+1` to `Ctrl+9` pastes that row outright, without selecting it first. The modifier is required because the search box has focus, and a bare digit belongs in the query. On Windows, `Enter` or a click pastes at the previous cursor position. On macOS and Linux, it copies the item and closes Quick Paste; paste manually in the target app. Press `Escape` to close without copying.

The transform row below the search runs a built-in pipeline over the highlighted item before paste. `F8` cycles forward through the list and `Shift+F8` cycles backward, leaving `Tab` to move focus as usual; the letter bindings are held with `Alt`, because the search box has focus and a bare letter belongs in the query: `Alt+T` Trim, `Alt+L` Lower, `Alt+U` Upper, `Alt+S` Sort/dedupe lines, `Alt+J` JSON pretty, `Alt+M` JSON minify, `Alt+B` Base64 encode, `Alt+D` Base64 decode, `Alt+E` URL encode, `Alt+X` URL decode. `Alt+Backspace` clears the active transform back to the un-transformed selection. The preview pane shows what will land on the clipboard; an invalid transform (malformed JSON, garbage base64, etc.) surfaces an inline error and refuses to paste. Image items have no transforms — the row is disabled and the preview pane shows "Image items have no transforms".

The search box's mode toggle picks how the query is matched: `Literal` (default) runs the existing FTS5 search; `Regex` compiles the whole query as a `regex::Regex` and runs it against the FTS5 pre-filter candidate set. The mode is shown as a token label next to the input, persists for the lifetime of the session, and is recorded when saving a search. A `(?i)` prefix in the pattern opts into case-insensitive matching. An invalid pattern surfaces an inline error and a `Dismiss` action; the previous rows stay on screen until the error is cleared.

Only Quick Paste is a system-wide (global) shortcut. All other shortcuts work while the SnipDock window has focus, so they never block `Ctrl+Shift` shortcuts in other applications (VS Code's command palette, search, etc.). The selected-item shortcuts act on the Clipboard History page. These accelerators are fixed in the current release.
