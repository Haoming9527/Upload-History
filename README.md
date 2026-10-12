<p align="center">
  <img src="public/icon/128.png" alt="Upload History" width="80" height="80" />
</p>

<h1 align="center">Upload History</h1>

<p align="center"><strong>Remember what you attached. Find it when you need it.</strong></p>

<p align="center">
  An open-source Chrome extension that keeps your file attachment history<br />
  and recoverable copies in one place—right in your browser.
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#features">Features</a> ·
  <a href="docs/PRIVACY.md">Privacy</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

---

## Find the file you sent hours, days, or weeks ago

Which version of your résumé did you attach? Where did you upload that assignment? What happened to the document you moved out of your Downloads folder?

Upload History gives your browser a searchable memory for file attachments. Once enabled, it records files you select or drop into supported website upload controls, along with the website, page title, and time. With **Save copies** enabled, you can download an independent copy later—even if the original has been moved or deleted.

Built for everyday tasks: school assignments, job applications, online forms, and document uploads. Google Forms is one example of the workflows it aims to support; the capture engine works across common browser upload controls rather than relying on a single platform.

**No account. No cloud sync. No files sent to us.**

## Features

| Feature                          | What it does for you                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Automatic attachment history** | Remember file selections and drops after you enable recording and grant website access.                       |
| **Recoverable local copies**     | Retrieve the exact saved file, independently of its original location.                                        |
| **Search and filters**           | Find attachments by filename, website, page title, date, or recording status.                                 |
| **Website preferences**          | Save copies, keep details only, or turn recording off for individual websites.                                |
| **Instant recording controls**   | Pause recording or change recording modes without pressing Save settings.                                     |
| **Flexible retention**           | Automatically remove older records, or mark important records as Keep to exclude them from automatic cleanup. |
| **Clear copy status**            | See which copies are saved, still saving, or unavailable, with a reason when saving fails.                    |
| **Local encryption**             | File copies and archive metadata are encrypted with AES-GCM in your Chrome profile.                           |

## How it works

1. **Enable recording.** Choose Save copies or Logs only, then approve Chrome's website-access request.
2. **Attach files as usual.** Use supported file pickers or drag-and-drop controls on websites.
3. **Find them later.** Open Upload History to search your records, inspect file details, and download saved copies.

**Save copies** stores file details and an independent copy within your configured limits. **Logs only** stores file details without reading or saving the file contents. **Off** disables recording for that website.

## Get started

Upload History is currently available as a **local development build**. A Chrome Web Store release is planned; it is not published yet.

### Install locally

You need **desktop Chrome 148 or newer** and **Node.js 24** (recommended).

```sh
git clone https://github.com/Haoming9527/Upload-History.git
cd Upload-History
npm ci
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3` inside the project folder.
3. Open Upload History from Chrome's extensions menu and complete onboarding.
4. Pin the extension for quick access to recent attachments and recording controls.
5. Try a disposable file on a supported upload page, then open your history and download the saved copy.

After rebuilding, click **Reload** on the extension's card and refresh your website tabs.

### Website compatibility

The capture engine supports standard file inputs, dynamic upload controls, file drops, and accessible embedded uploaders, including tested shadow-DOM fixtures. It accepts any file type exposed through a supported control, subject to size and storage limits.

Compatibility depends on how each website handles files. Cloud-document pickers, proprietary controls, and browser-restricted pages may not expose a file the extension can capture. Incognito and mobile browsers are outside the current scope. Named platforms and school portals need individual workflow testing.

See the [compatibility guide](docs/COMPATIBILITY.md) for coverage and the [testing guide](docs/TESTING.md) for a Google Forms walkthrough.

## Your archive, your controls

| Setting              | Default | Adjustable range               |
| -------------------- | ------- | ------------------------------ |
| Maximum saved file   | 50 MiB  | 1–50 MiB                       |
| Local archive budget | 500 MiB | 50–2,000 MiB                   |
| New-record retention | 90 days | 1–3,650 days, or until deleted |

Recording preferences save immediately. Retention, maximum file size, and storage budget apply when you click **Save settings**. Retention changes apply to new records.

Existing copies are never evicted to make space. When a new copy cannot fit, the extension keeps a failure record if space for its details remains. If the archive cannot accept another record, it displays a capture warning.

## Privacy by design

- Recording starts only after your consent and website permission.
- Files and history stay in the current Chrome profile; there is no backend, analytics, or developer-operated upload service.
- You can pause recording, exclude websites, delete records, or clear the archive.
- URL credentials, query strings, and fragments are removed before storage.

The encryption key is stored in the same browser profile, without a separate password. Someone with access to that profile may access the archive. Preferences and storage-management fields are not all encrypted. Keep separate backups of important files: uninstalling the extension or deleting its profile can remove the archive.

Read the [privacy policy](docs/PRIVACY.md) and [security model](SECURITY.md).

## Development

Built with **TypeScript, React, WXT, and Manifest V3**, using IndexedDB and Web Crypto for local storage.

```sh
npm run dev          # Start development mode
npm run check        # Type checking, unit tests, and production build
npx playwright install chromium
npm run test:e2e     # Run browser scenarios
npm run zip          # Package the extension for distribution
```

Automated checks cover capture, recording policies, encrypted storage, byte-for-byte recovery, browser restarts, and settings persistence. The browser harness pregrants website access in a separate test manifest; native permission prompts and real-platform compatibility still require manual checks.

- [Architecture](docs/ARCHITECTURE.md)
- [Testing and verification](docs/TESTING.md)
- [Chrome Web Store release guide](docs/RELEASE.md)

## Help improve Upload History

Found an upload flow that does not work? Have an idea that would make finding old attachments easier? [Open an issue](https://github.com/Haoming9527/Upload-History/issues) or read the [contribution guide](CONTRIBUTING.md).

Use sample files and sanitized details in bug reports. Report sensitive vulnerabilities through the process in [SECURITY.md](SECURITY.md).

If Upload History is useful to you, **star the repository** to help others discover it.

## License

[MIT](LICENSE) — free to use, inspect, and contribute to.
