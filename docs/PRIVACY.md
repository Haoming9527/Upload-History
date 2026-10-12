# Upload History privacy policy

Effective October 12, 2026 · version 0.1.0

Upload History remembers files you select or drop on websites and, when enabled, keeps a local copy for later recovery. Recording starts only after you consent and grant website access.

## What the extension stores

Records include the filename, type, size, last-modified time, capture time, website and frame origin, page title, sanitized page location, save status, and retention settings. Save copies mode also reads and stores the selected file's bytes and an integrity digest. Logs only mode does not read or store file contents. Disabled sites are not recorded. Incognito recording is disabled.

URL credentials, query strings and fragments are removed. A path or page title can still contain personal information. The extension records selection or dropping of a file.

## Where information goes

Your archive stays in the current Chrome profile. The extension has no account, backend, cloud sync, analytics, advertising, or developer-operated data collection endpoint. We do not receive or sell your files or history. Normal website uploads continue independently. Chrome Web Store and browser services follow their own policies.

## Local protection

Archive metadata and file chunks are encrypted with AES-GCM. The encryption key is stored in the same browser profile, without an additional password. Some storage-management fields, including record sizes, expiry times and statuses, remain unencrypted. Recording preferences and site rules are stored in Chrome's local extension settings. This is not protection against someone who can access your browser profile, compromised extension code, or malware.

## Retention and deletion

New records expire after 90 days by default. You can change retention or Keep a record until you delete it. Cleanup runs when the browser has an opportunity, not at an exact guaranteed time. Kept records count toward the storage budget. Existing copies are not automatically removed to make space for new ones. You can delete individual records, selected records, or all history in the extension.

Deletion removes the extension's records and stored contents but is not a forensic secure-erasure guarantee. Files you download are separate and must be deleted separately. Removing the extension or browser profile can permanently remove the archive and its encryption key. This extension is not a backup service.

## Your controls

You can pause recording, choose logs only, disable specific sites, or revoke website permissions. Pending copies are cancelled when recording is stopped. Revoking access does not delete existing history; use Delete all history for that.

## Limited use and support

Information is used only to provide the file-history and recovery features described here. Upload History's use of information follows the Chrome Web Store User Data Policy, including its Limited Use requirements.

For questions or a security report, use the [project repository](https://github.com/Haoming9527/Upload-History). Do not include private files, browsing history, or personal details in public issues.
