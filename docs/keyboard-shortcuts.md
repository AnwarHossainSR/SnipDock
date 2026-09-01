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

The transform row below the search runs a built-in pipeline over the highlighted item before paste. `Tab` cycles forward through the list and `Shift+Tab` cycles backward; the single-letter bindings are `T` Trim, `L` Lower, `U` Upper, `S` Sort/dedupe lines, `J` JSON pretty, `M` JSON minify, `B` Base64 encode, `D` Base64 decode, `E` URL encode, `X` URL decode. `Backspace` clears the active transform back to the un-transformed selection. The preview pane shows what will land on the clipboard; an invalid transform (malformed JSON, garbage base64, etc.) surfaces an inline error and refuses to paste. Image items have no transforms — the row is disabled and the preview pane shows "Image items have no transforms".

Only Quick Paste is a system-wide (global) shortcut. All other shortcuts work while the SnipDock window has focus, so they never block `Ctrl+Shift` shortcuts in other applications (VS Code's command palette, search, etc.). The selected-item shortcuts act on the Clipboard History page. These accelerators are fixed in the current release.
