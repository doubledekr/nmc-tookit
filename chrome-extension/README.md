# NMC Toolkit — Chrome extension (test build)

Adds a **Send to NMC toolkit** button to Salesforce lead pages. It reads the open lead the same way the
bookmarklet does and posts it to the NMC Toolkit desktop app on this computer (127.0.0.1 only — nothing
leaves the machine). The lead appears at the top of the Pipeline as **New from Salesforce · via Chrome**.

## Install (developer mode)
1. Chrome → `chrome://extensions` → switch on **Developer mode**.
2. **Load unpacked** → pick this folder (the desktop app shows the exact path under Settings → Chrome extension).
3. Open a Salesforce lead; click the red button bottom-right (or the toolbar icon → *Send this lead*).

If the desktop app isn't running the extension copies the lead to the clipboard instead, so
*Paste from clipboard & parse* still works.

## Updating
The desktop app ships this folder inside its install and replaces it on every app update.
Restart Chrome after a toolkit update and the extension picks up the new code.

## Port
Default `47831`. Change it in the extension popup if something else on the PC uses that port
(set `NMC_SF_PORT` for the app to match).
