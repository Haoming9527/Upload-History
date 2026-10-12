# Chrome Web Store release

The repository contains a local MVP and submission materials. No store publication is implied. Account setup, a reachable public privacy URL, native permission checks, and real-site compatibility checks must be completed before submission.

## Prepare the package

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run zip
```

Use the Chrome extension ZIP produced under `.output/`. It must have `manifest.json` at its root, the correct version, locally bundled scripts, and all icons. Do not submit test manifests, browser profiles, or the repository directory. Inspect the ZIP after building; the test harness pregrants hosts only in an ignored copy.

The actual production permission list is `storage`, `scripting`, `alarms`, with optional hosts `http://*/*` and `https://*/*`. It must not request `downloads`, `history`, `tabs`, or `debugger`, require broad hosts at install, replace Chrome's history page, or inject scripts before consent. Chrome 148+ is the declared minimum.

## Store listing copy

**Name:** Upload History

**Short description:** Remember files you attach to websites and recover a private local copy later.

**Detailed description:**

> Find the file you attached, even after you have moved or deleted the original.
>
> Upload History remembers file selections and drops on websites. It keeps the filename, website, page title, and time, with an optional independent local copy you can download later. It works through common browser file controls across forms and submission pages; compatibility depends on the site's upload mechanism.
>
> Search your history, filter by website or date, keep important records, and delete records and their saved copies whenever you want. Pause recording globally or choose a different mode for each website. Logs-only mode records file details without reading file contents.
>
> Your archive stays in your Chrome profile. There are no accounts, cloud sync, analytics, or uploads to the developer. Recording begins only after you agree and grant website access. Incognito capture is disabled.
>
> Saved copies support files up to 50 MiB. The default local budget is 500 MiB and new records expire after 90 days unless kept. Copies and metadata are encrypted with a key held in the same browser profile; this is not protection against someone with access to that profile. Uninstalling can remove the archive. Keep separate backups of important files.
>
> A record confirms a file selection or local copy, not a successful submission. Check the website for a submission receipt. Cloud-document pickers and some custom upload controls may not be detected.
>
> Open source. Chrome 148 or newer required.

Do not add “works with every form,” school-platform certification, submission-proof claims, or “no data collected.” Use screenshots containing synthetic files, with no student names, real documents, or private site URLs.

## Privacy tab copy and guidance

**Single purpose:** Help users remember files they attach to websites and recover optional copies saved locally in their Chrome profile.

| Permission                | Justification                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                 | Persist recording preferences and per-site modes in local extension settings.                                                                                                     |
| `scripting`               | Register the file-selection observer on granted websites after consent and permission, including accessible embedded upload controls.                                             |
| `alarms`                  | Periodically remove expired archive records when Chrome runs the extension.                                                                                                       |
| Optional HTTP/HTTPS hosts | Observe user-selected files and capture their site context across websites after a user explicitly enables automatic recording. Users can pause, exclude sites, or revoke access. |

**Remote code:** No. Executable scripts, dependencies, and styles ship in the extension package.

**Data handling explanation:** The extension handles selected-file contents in copies mode, filenames and file metadata, site URLs/origins, page titles, selection timestamps, and recording preferences. This information stays locally; the developer receives none. Logs-only mode does not read file contents.

Do not select “no data” solely because there is no server. The dashboard categories should reflect local handling: web history for site locations, website content for titles/content, and user activity for selection events/times. Review the remaining categories against arbitrary selected file contents, which can include personally identifiable, communication, health, or financial information. Use the current dashboard definitions and keep all declarations consistent with the implementation and policy. Certify limited-use statements only after checking the submitted build.

**Privacy URL:** Publish the policy at a stable, publicly accessible URL and open it while signed out. The packaged `privacy.html` cannot serve as the store URL. After the repository and file are public, its [privacy document](https://github.com/Haoming9527/Upload-History/blob/main/docs/PRIVACY.md) is a possible hosted URL; verify the branch and access before entering it. Keep it identical in substance to `public/privacy.html`.

Google requires disclosures even for local handling. Its current FAQ also calls for secure storage and an affirmative in-product disclosure before handling data. See the [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [privacy fields guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## Reviewer instructions

> The extension has no account or backend. Open Upload History, read the onboarding disclosure, choose file copies or logs only, and enable website access. Use a harmless local file with a standard file input on an HTTP or HTTPS test website. The history should show the file selection and, after saving, offer a download with identical contents. No form submission is required.
>
> Pause recording or set the site to logs only, then choose another dummy file and inspect the different behavior. Review the record detail, Keep, and confirmed deletion. Files above the configured size or available budget show a failed copy when metadata space remains. The extension never labels selection as a confirmed website submission.
>
> The repository includes a synthetic upload fixture and an automated test harness. The harness pregrants hosts in its separate test copy; the submitted extension requests permission through Chrome after the user's onboarding action.

Before submission, provide a reachable synthetic reviewer page or concrete permitted test URL in the dashboard's Test instructions. Do not require reviewers to use private school credentials, an actual assignment, or an inaccessible development server. If a particular feature needs credentials, provide a dedicated permitted test account through the dashboard's test-instructions facility.

## Publication gates

- [ ] Complete the [manual native permission and Google Forms checks](TESTING.md); record actual results rather than inferring third-party compatibility from fixtures.
- [ ] Confirm unit checks, production build, browser suite, and ZIP creation all pass for the release commit.
- [ ] Verify privacy wording, data categories, screenshots, version, permissions, and packaged files against that same ZIP.
- [ ] Register the publisher account, pay the one-time fee, verify contact email, enable two-step verification, and declare trader/non-trader status accurately. Complete required trader verification when applicable.
- [ ] Publish and verify the public privacy policy and support URL. Enable monitored private security reporting.
- [ ] Finish name, description, category, icons, screenshots, geographic distribution, permission justifications, and reviewer instructions in the dashboard.
- [ ] Start with a private trusted-tester release, address feedback, then choose the intended public distribution and submit/release it.
- [ ] After approval and publication, add the verified store URL to the README and record the published version. Until then, retain the unpublished status.

Private and unlisted distributions still go through review. Review time can vary, so do not promise a fixed public launch date. Relevant official guidance: [registration](https://developer.chrome.com/docs/webstore/register), [account setup](https://developer.chrome.com/docs/webstore/set-up-account), [trader status](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq), [distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution), and [publishing](https://developer.chrome.com/docs/webstore/publish).
