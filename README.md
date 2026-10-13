<a id="top"></a>

<p align="center">
  <img src="public/icon/128.png" alt="Upload History" width="80" height="80" />
</p>

<h1 align="center">Upload History</h1>

<p align="center">
  <strong>Your browser remembers your downloads. Now remember your uploads.</strong>
</p>

<p align="center">
  Remember what you attached, where you attached it, and when.<br />
  Find the exact saved file later—even if the original has been moved or deleted.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/Upload%20History/cdkjpgfbcpfnicgbipnomlnjcaagflef"><img src="https://img.shields.io/badge/Add_to_Chrome-2859E5?style=for-the-badge&amp;logo=googlechrome&amp;logoColor=white" alt="Add to Chrome" /></a>
  <a href="https://haoming9527.github.io/Upload-History/"><img src="https://img.shields.io/badge/Try_the_Demo-172B4D?style=for-the-badge&amp;logo=githubpages&amp;logoColor=white" alt="Try the interactive demo" /></a>
</p>

<p align="center">
  <a href="https://github.com/Haoming9527/Upload-History/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Haoming9527/Upload-History/ci.yml?branch=main&amp;style=flat-square&amp;label=build&amp;logo=githubactions&amp;logoColor=white" alt="Build and verification status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2859E5?style=flat-square" alt="License: MIT" /></a>
  <a href="#get-started"><img src="https://img.shields.io/badge/Chrome-148%2B-2859E5?style=flat-square&amp;logo=googlechrome&amp;logoColor=white" alt="Requires Chrome 148 or newer" /></a>
  <a href="https://github.com/Haoming9527/Upload-History/stargazers"><img src="https://img.shields.io/github/stars/Haoming9527/Upload-History?style=flat-square&amp;label=stars&amp;color=E7B84B&amp;logo=github&amp;logoColor=white" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://haoming9527.github.io/Upload-History/">Website & demo</a> ·
  <a href="#features">Features</a> ·
  <a href="docs/PRIVACY.md">Privacy</a> ·
  <a href="#development">Development</a> ·
  <a href="https://github.com/Haoming9527/Upload-History/issues">Report a bug</a>
</p>

---

<details>
<summary><strong>Explore the project</strong></summary>

- [Get started](#get-started)
- [Features](#features)
- [How it works](#how-it-works)
- [Website compatibility](#website-compatibility)
- [Archive settings](#your-archive-your-controls)
- [Privacy](#privacy)
- [Frequently asked questions](#frequently-asked-questions)
- [Development](#development)
- [Contribute & support](#contribute--support)
- [License](#license)

</details>

## Which version did you send?

The resume you attached last week. The assignment you uploaded before the deadline. The application document you edited afterward.

**Upload History gives those attachments a searchable home.** Once you enable recording, it remembers files selected or dropped into supported website upload controls, along with the website, page title, and time. With **Save copies** enabled, you can recover an independent copy of the file you attached.

Free and open source. **No account, no analytics, no cloud sync, and no files sent to us.**

## Get started

### [Add Upload History to Chrome →](https://chromewebstore.google.com/detail/Upload%20History/cdkjpgfbcpfnicgbipnomlnjcaagflef)

Requires **desktop Chrome 148 or newer**.

1. Install the extension and pin it to your toolbar.
2. Open Upload History, choose **Save copies** or **Logs only**, and grant website access.
3. Attach a file as usual, then open the extension to find its record and recover its saved copy.

Recording starts only after you enable it and grant access. You can pause it or change recording preferences for individual websites at any time.

> [!TIP]
> Try it with a sample file first. Attach it on a supported website, wait for **Copy saved**, then download it from Upload History to see recovery in action.

## Features

| Feature                      | What you can do                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| **Remember attachments**     | See the filename, website, page title, and time in one history.                            |
| **Recover exact copies**     | Download a saved attachment even after moving or deleting the original.                    |
| **Find files quickly**       | Search by filename, website, or page title; filter by website, date, or status.            |
| **Track different versions** | Keep separate records and saved copies for attachments with the same filename.             |
| **Choose what gets saved**   | Save copies, log file details only, or disable recording for individual websites.          |
| **Keep what matters**        | Mark important records as **Keep**, adjust retention, or delete records whenever you want. |
| **Know what's available**    | See whether a copy is saved, still saving, or unavailable—and why.                         |

## How it works

**Attach → Remember → Recover**

Use website upload controls as usual. Upload History records supported file selections and drops in the background. Open the popup for recent attachments, or search the full archive when you need an older file.

| Recording mode  | What's stored                                                             |
| --------------- | ------------------------------------------------------------------------- |
| **Save copies** | File details and an independent file copy, within your configured limits. |
| **Logs only**   | File details, without reading or saving file contents.                    |
| **Off**         | No new records for that website.                                          |

### Website compatibility

Upload History works with standard file pickers, dynamic upload controls, file drops, and accessible embedded uploaders. It accepts any file type exposed through a supported control, subject to size and storage limits.

Compatibility depends on the website. Cloud-document pickers, some custom uploaders, and browser-restricted pages may not expose files the extension can capture. Incognito and mobile browsers are not supported.

See the [compatibility guide](docs/COMPATIBILITY.md) for coverage and the [testing guide](docs/TESTING.md) to try a Google Forms workflow.

## Your archive, your controls

| Setting              | Default | Adjustable range               |
| -------------------- | ------- | ------------------------------ |
| Maximum saved file   | 50 MiB  | 1–50 MiB                       |
| Local archive budget | 500 MiB | 50–2,000 MiB                   |
| New-record retention | 90 days | 1–3,650 days, or until deleted |

Recording preferences save immediately. Retention, maximum file size, and storage budget apply when you click **Save settings**. Retention changes apply to new records; records marked **Keep** stay until you delete them.

Existing copies are not automatically deleted to make room. Files that cannot be saved receive a history record with an explanation when browser storage and record limits allow. Recovery is available for successfully saved copies still retained in your archive.

## Privacy

Your files and history stay in your current Chrome profile. Upload History has no backend, analytics, or developer-operated upload service.

- **You choose when to record.** Enable recording after consent, pause it, or exclude websites.
- **You control deletion.** Remove individual records or clear your archive.
- **Copies are encrypted locally.** File contents and archive metadata use AES-GCM encryption.
- **URLs are trimmed.** Credentials, query strings, and fragments are removed before storage.

The encryption key lives in the same browser profile, without a separate password. Someone with access to that profile may access the archive. Preferences and some storage-management fields are not encrypted. Uninstalling the extension or deleting its browser data can remove saved copies, so keep separate backups of important files.

[Privacy policy](docs/PRIVACY.md) · [Security model and reporting](SECURITY.md)

## Frequently asked questions

<details>
<summary><strong>Can I recover a file after deleting the original?</strong></summary>

Yes, if Upload History successfully saved a copy and that copy is still in your archive. Moving, renaming, editing, or deleting the original does not change an already saved copy.

</details>

<details>
<summary><strong>Can it find attachments from before I installed it?</strong></summary>

No. Recording begins after you enable it and grant website access. Upload History cannot reconstruct earlier attachments.

</details>

<details>
<summary><strong>Does my history sync between computers?</strong></summary>

No. Your archive stays in the Chrome profile where it was recorded. There is no account or cloud sync.

</details>

<details>
<summary><strong>Why is there a record without a saved copy?</strong></summary>

The website may be set to **Logs only**, the file may exceed your size limit, or storage may be unavailable. Open the record to see its status and explanation. A details-only record cannot be used to recover file contents.

</details>

<details>
<summary><strong>How do I report an uploader that doesn't work?</strong></summary>

Use the [upload compatibility report](https://github.com/Haoming9527/Upload-History/issues/new?template=compatibility.yml). Include your Chrome and extension versions, the website, and whether you used a file picker or drag and drop. Use harmless sample files and remove private details.

</details>

## Development

<p>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-172B4D?style=flat-square&amp;logo=react&amp;logoColor=61DAFB" alt="React" /></a>
  <a href="https://wxt.dev/"><img src="https://img.shields.io/badge/WXT-257D62?style=flat-square" alt="WXT" /></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/Manifest-V3-2859E5?style=flat-square&amp;logo=googlechrome&amp;logoColor=white" alt="Manifest V3" /></a>
</p>

Built with **TypeScript, React, WXT, and Manifest V3**, using IndexedDB and Web Crypto for local storage.

### Install locally

Use **Node.js 24** (recommended) and **desktop Chrome 148 or newer**.

```sh
git clone https://github.com/Haoming9527/Upload-History.git
cd Upload-History
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3` inside the project.
3. Open the extension and complete onboarding.

After rebuilding, click **Reload** on the extension's card and refresh your website tabs.

### Useful commands

```sh
npm run dev          # Start development mode
npm run check        # Structure, types, unit tests, and extension/site builds
npx playwright install chromium
npm run test:e2e     # Run browser scenarios
npm run zip          # Package the extension for distribution
```

Automated checks cover capture, recording policies, encrypted storage, byte-for-byte recovery, browser restarts, and settings persistence. The browser harness pregrants website access in a separate test manifest; native permission prompts and real-platform compatibility also need manual verification.

[Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [Release guide](docs/RELEASE.md) · [Website development](site/README.md)

## Contribute & support

You don't have to write code to help. Test an upload flow, improve the docs, suggest a feature, or contribute a fix.

| Want to help?                       | Start here                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Something isn't working             | [Report a bug](https://github.com/Haoming9527/Upload-History/issues/new?template=bug.yml)                           |
| A website's uploader isn't recorded | [Report a compatibility issue](https://github.com/Haoming9527/Upload-History/issues/new?template=compatibility.yml) |
| Have an improvement in mind         | [Browse issues and suggest an idea](https://github.com/Haoming9527/Upload-History/issues)                           |
| Ready to contribute code or docs    | [Read the contribution guide](CONTRIBUTING.md)                                                                      |
| Want to meet the contributors       | [View contributors](https://github.com/Haoming9527/Upload-History/graphs/contributors)                              |

Use sample files and sanitized details in public reports. For sensitive vulnerabilities, follow [SECURITY.md](SECURITY.md).

**Find it useful? Give Upload History a ⭐ on GitHub, share it with someone who could use it, or leave an honest review on the [Chrome Web Store](https://chromewebstore.google.com/detail/Upload%20History/cdkjpgfbcpfnicgbipnomlnjcaagflef).**

## License

[MIT](LICENSE) — free to use, inspect, and contribute to.

---

<p align="center">
  <strong>A little memory for your uploads.</strong><br />
  <a href="https://chromewebstore.google.com/detail/Upload%20History/cdkjpgfbcpfnicgbipnomlnjcaagflef">Install Upload History</a> ·
  <a href="https://github.com/Haoming9527/Upload-History">Star on GitHub ⭐</a> ·
  <a href="#top">Back to top ↑</a>
</p>
