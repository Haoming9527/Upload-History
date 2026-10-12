# Testing Upload History

Use dummy files and a disposable test profile. Keep a copy of any file you care about; do not use a real submission to test capture or deletion.

## Automated checks

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

On Linux CI, use `npx playwright install --with-deps chromium`. An existing compatible Chromium executable can be selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when needed.

Unit tests exercise policy, metadata, capture transfer, and encrypted archive behavior. The browser suite loads a production build with a copied test manifest. It asserts the real manifest has only the intended required permissions and no mandatory hosts, then pregrants hosts **in that test copy only** because the native optional-permission dialog cannot be automated by this harness. All bundled capture, worker, storage, and UI scripts remain the production scripts.

The fixture suite covers capture before/after consent, independent recovered bytes after deleting the source, same-name replacements, dynamic inputs, shadow roots, frames, file drops, logs-only reads, pause/exclusions, size failures, multiple/empty files, hostile filenames, download, restart, and deletion. See `artifacts/browser-test-results.json` for the checks completed by a particular run; do not interpret an interrupted run as a pass. Screenshots are in `artifacts/screenshots/`.

Test browser profiles remain under ignored `artifacts/browser-*` directories. They must not be committed, attached to issues, or included in release packages. CI uploads only screenshots and ZIPs.

## Native permission and onboarding checks

Run these against `.output/chrome-mv3` with its **unmodified production manifest**:

1. Install through `chrome://extensions`. Confirm the first-run explanation is visible and recording is off.
2. Choose a dummy file on a test website before enabling the extension. Confirm no history record appears.
3. Click **Enable Upload History**, deny Chrome's permission prompt, and confirm the UI explains that access was not granted and capture remains off.
4. Try again and grant access. Confirm capture starts only after consent. Reload an already-open test page if needed.
5. Revoke website access in Chrome's extension settings. Confirm the warning appears and a new selection is not captured on a site without access. Existing history should remain readable.
6. Re-enable access and confirm capture resumes. Check that Chrome does not allow this extension in incognito.

Passing automated tests does not replace these native permission checks.

## Google Forms local file test

Use a form you own or have permission to test that contains a **file upload** question. The form may require a Google account. Use the local-device file option rather than selecting an existing cloud document. If no local-file option is available, record that workflow as untested.

1. Create a harmless text file, such as `upload-history-test.txt`, containing a unique sentence.
2. With recording enabled in **Save copies** mode, open the form and choose that file in its upload question. Wait for **Copy saved** in Upload History. There is no need to submit the form.
3. Open the record. Check the filename, site, page title, time, and selection method. Its label must not claim the form was submitted.
4. Download the saved copy and compare its contents with the original. Move or delete only the disposable original and repeat the download.
5. Change the file's contents, then replace the attachment through the form's controls. Verify separate selections remain distinguishable and the earlier copy remains unchanged. The form may have its own limits or require removing its previous attachment first.
6. Cancel or leave the form. Verify that the selection history still exists; cancellation is not a reason to label the record as a successful submission.

Repeat on each school submission workflow you want to advertise. Record date, platform, Chrome version, extension version, and upload method. A Google Forms pass does not establish Canvas, Moodle, Classroom, Microsoft Forms, or every school portal as supported.

## Recording controls and storage

| Check                                                             | Expected outcome                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pause, then choose another dummy file                             | No new record. Resume to restore capture.                                                                                                                                       |
| Switch a site to logs only                                        | A **Log only** record; no download button or stored file copy.                                                                                                                  |
| Disable the top-level school site                                 | No new records from the page or its embedded uploader.                                                                                                                          |
| Apply a restrictive mode to an embedded uploader's own origin     | The restrictive frame rule is respected.                                                                                                                                        |
| Set max file size to 1 MiB; choose a dummy file larger than 1 MiB | **Copy not saved**, with the size reason, while metadata space remains.                                                                                                         |
| Set budget to 50 MiB; fill it using harmless files                | Existing copies remain; copies that do not fit show a failure if metadata fits. A fully exhausted archive cannot retain another record and shows a dismissible capture warning. |
| Keep a record, reload, restart Chrome                             | Keep and downloaded bytes persist; it still counts toward the budget.                                                                                                           |
| Delete selected records; cancel the first confirmation            | Cancellation preserves them; confirmed deletion removes records and copies.                                                                                                     |
| Clear all history                                                 | Confirmation warns about kept records too; the archive empties while settings remain.                                                                                           |

Restore the defaults after these checks: 50 MiB maximum file, 500 MiB budget, 90-day retention, recording enabled, and no test site overrides. Retention timing is covered by controlled-time unit tests; a manual seven-day setting does not test immediate cleanup.

## Release evidence

Keep a dated compatibility matrix and sanitized screenshots. Verify the actual ZIP's manifest, not only the source configuration. Test updates with existing records and test on another permitted device before inviting public users. Release status and manual gates are tracked in [Release](RELEASE.md).
