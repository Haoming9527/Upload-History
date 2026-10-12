# Upload History security

Upload History archives user-selected files. Treat its stored contents, filenames, website locations, and titles as sensitive, even though they remain on the device.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** option if private reporting is enabled. If it is unavailable, open a minimal issue asking for a private contact method without publishing exploit details, private documents, or browser data. Do not send real assignments, credentials, complete browsing histories, or a Chrome profile.

Include the extension version, Chrome version, operating system, a harmless reproduction, and the affected boundary. The project does not promise a response-time SLA. Before store publication, the maintainer should enable private vulnerability reporting and verify that incoming reports are monitored.

## What is protected

- Archive metadata and file chunks use AES-256-GCM with a fresh nonce for each encryption. Authenticated context binds encrypted data to a record and chunk.
- A non-extractable Web Crypto key persists in the same profile. This prevents ordinary key export through that API; it does not put the key outside the profile's trust boundary.
- The background worker owns persistence and validates capture senders, message shape, current permissions, recording mode, and transfer ownership. Archive-management messages are accepted only from the extension UI pages.
- Content scripts run in Chrome's isolated world. They observe trusted file-selection/drop events without submitting forms or replacing upload behavior.
- Capture requires consent and website access. Logs-only mode does not read file contents. Incognito is disabled.
- Local settings access is limited to trusted extension contexts. Executable code is bundled; the production extension has no remote script or analytics endpoint.

## Limits

Someone with access to the browser profile, extension execution privileges, or malware on the device may access the archive and key. There is no passphrase, independent hardware key, remote recovery, or cloud backup. Record sizes, status, expiry, and other storage indexes remain in plaintext; recording preferences and site rules are also stored locally without archive encryption.

AES-GCM and the file digest detect certain corruption or substitutions. They do not prove that a website accepted a submission or provide an independently verifiable timestamp. A page title and sanitized URL path can still expose personal information. Per-site exclusion and logs-only mode reduce stored content, but filenames and metadata may themselves be sensitive.

Deleting data is not a forensic secure-erasure guarantee. Downloaded copies remain outside the extension's control. Uninstalling or losing the profile/key can make stored copies unrecoverable. If the key is missing, the extension reports failure rather than silently replacing it and claiming existing records are intact.

## Supported versions

Security fixes target the current development and release version. There are no maintained older release branches. Update the extension promptly when a security fix is available.
