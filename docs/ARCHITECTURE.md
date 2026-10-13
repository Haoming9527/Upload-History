# Upload History architecture

Upload History is a Manifest V3 extension built with WXT, TypeScript, and React. Its storage and capture boundary is the current Chrome profile. There is no server component.

## Components

| Component                                           | Responsibility                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoints/capture.content.ts` and `src/capture/` | Observe trusted file input changes and file drops, discover relevant shadow roots, snapshot file references, and send bounded transfers.             |
| `entrypoints/background.ts`                         | Enforce consent, permissions and site modes; validate senders; serialize mutations; own archive access; register content scripts and cleanup alarms. |
| `src/storage/archive.ts`                            | Encrypt and persist metadata/chunks in IndexedDB; enforce reservations; finalize, recover, expire, and delete records.                               |
| `src/shared/`                                       | Define messages, validated settings, recording policy, limits, and URL sanitization.                                                                 |
| `src/ui/` and UI entrypoints                        | Present consent, popup, history, detail, settings, deletion, and downloaded copies.                                                                  |

### Module layout

- `entrypoints/background.ts` starts `src/background/runtime.ts`, which owns message handling and worker lifecycle. `src/background/registration.ts` manages website permissions and content-script registration.
- `src/storage/archive.ts` owns archive operations and serialization. `crypto.ts` owns key handling, authenticated encryption, and metadata integrity; `schema.ts` describes the persisted IndexedDB records. These internal modules preserve the archive's public interface and existing storage format.
- `src/ui/App.tsx` composes the application shell. `features/` groups history, settings, popup, and onboarding views. `components/` contains shared controls, `data/` contains archive access, and `lib/` contains formatting and UI types.
- `src/ui/styles/index.css` imports styles by responsibility in a fixed order, preserving the cascade. Responsive rules remain last.
- `scripts/e2e/harness.mjs` owns the browser, fixture server, temporary profile, and capture helpers. `scripts/e2e/run.mjs` contains the behavioral scenarios.
- `scripts/checks/` contains repository checks, `scripts/assets/` contains asset generation, and `tests/unit/` contains unit tests alongside the separate `tests/fixtures/` browser fixtures.

`npm run check:structure` enforces a 500-line maximum for authored code, including CSS and tests. Generated files and lockfiles are outside that limit.

## Capture lifecycle

1. Before consent and permission, no capture content script is registered. Onboarding explains local handling before requesting optional HTTP/HTTPS host access.
2. The worker registers isolated content scripts for granted origins. Listeners inspect trusted input/drop events in accessible frames and discovered shadow roots. They do not submit or alter the form.
3. The worker determines the top-level website and frame origin from Chrome's sender/tab information. Global pause, top-site rules, frame rules, and current host access determine the effective mode; restrictive rules take precedence.
4. Logs-only mode persists metadata without reading bytes. Copies mode reserves budget before transferring 256 KiB chunks, using a token bound to the document, frame, and record.
5. Each chunk is encrypted and persisted by the worker. Finalization checks completeness and calculates a SHA-256 digest before marking the copy saved. Interrupted/incomplete copies remain failures, not successful downloads.

Records are independent occurrences. Replacing a selection with a same-named file creates another record; it does not overwrite the earlier bytes. An occurrence records a file selection or drop, not a completed submission.

## Persistence and trust

IndexedDB contains `records`, `chunks`, and `keys` stores. Metadata and chunks use AES-256-GCM with independent nonces and authenticated record/chunk context. A non-extractable `CryptoKey` is stored in the same profile. The profile is therefore the security boundary, not a password-protected vault.

Plaintext storage-management fields support accounting, status, and retention. Recording settings and exact-origin rules live in `chrome.storage.local`, restricted to trusted extension contexts. Paths and titles may contain personal data even after URL credentials, queries, and fragments are removed.

UI messages are restricted to the popup, history, and options pages. Downloads use short-lived, UI-owned tickets; the UI obtains chunks and creates a local Blob download. The production manifest requests neither `downloads` nor browsing `history` permission.

## Budget and retention

The default budget is 500 MiB; every record consumes a conservative 16 KiB allowance, and chunks include an additional accounting allowance. Pending transfers reserve their full expected cost so concurrent copies are only admitted when the current budget has room. This is not an exact on-disk measurement. Chrome quota or device errors can still prevent storage below the configured ceiling.

An oversized file or insufficient copy budget produces a failed-copy record. History metadata may exceed the configured budget; the 10,000-record ceiling and actual browser quota still bound it. Known dropped captures are reported through a dismissible capture warning, separately from an archive-opening failure. Existing files are preserved rather than evicted to create space.

Size and budget limits are checked when the worker admits a new copy. Changing these limits leaves admitted transfers and their reservations intact, even if the new budget is below current usage. Pause, disabled recording, consent withdrawal, and permission revocation still cancel active copies. Retention changes apply to new records.

On consent, the UI makes a best-effort request for persistent browser storage. Chrome may decline it; this is not a guarantee against eviction or profile loss and does not change the configured budget.

New records default to 90 days. Keep removes expiry; removing Keep uses the configured retention from the original capture time and may expire an old record immediately. Changing the default retention does not rewrite existing expiry dates. Cleanup occurs during archive operations and periodic alarms, when Chrome runs the worker. Clearing all removes records, chunks, and the archive key, while retaining recording preferences.

## Extension permissions

Required permissions are `storage`, `scripting`, and `alarms`. Broad HTTP/HTTPS hosts are declared as **optional** and requested only after disclosure and a user action. The release manifest must not contain mandatory `host_permissions`, statically injected `content_scripts`, or a `chrome_url_overrides` history replacement. Incognito is `not_allowed`.

See [Security](../SECURITY.md) for limits, [Compatibility](COMPATIBILITY.md) for coverage, and [Testing](TESTING.md) for the production-versus-test manifest distinction.
