# Contributing to Upload History

The project helps people remember file attachments after successful submission. Preserve that distinction in code, documentation, and screenshots.

## Work locally

1. Install dependencies with `npm ci`.
2. Run `npm run dev`, or `npm run build` and load `.output/chrome-mv3` through `chrome://extensions`.
3. Use harmless sample files and a separate test profile.
4. Run `npm run check`. For capture, storage, messaging, permissions, or UI download changes, also install the Playwright browser and run `npm run test:e2e`.
5. Include the relevant manual results from [Testing](docs/TESTING.md) when changing native permissions or platform compatibility.

Keep changes focused. Add regression coverage for meaningful bugs, update documentation when behavior changes, and retain the package lockfile. Do not commit `.output`, `artifacts`, downloaded test files, private screenshots, or browser profiles.

## Design constraints

- Keep one purpose: attachment history and local file recovery.
- Do not read file bytes in logs-only mode or capture before consent.
- Do not introduce network uploads, analytics, broad new permissions, or remote executable code without an explicit product decision and corresponding disclosure changes.
- Do not treat a file picker, Submit click, or network request as proof of server acceptance.
- Preserve original website behavior and make failures visible.
- Use real fixture coverage and manual observations for compatibility claims. A platform name alone is not a tested integration.

## Compatibility reports

Use the compatibility issue template with the platform, Chrome/extension versions, recording mode, upload mechanism, and expected versus observed behavior. Include a public synthetic reproduction when possible. Remove personal details from URLs and screenshots. Never attach a real school submission, credentials, or browser profile to a public issue.

For vulnerabilities, follow [Security](SECURITY.md) instead. Contributions are provided under the project's [MIT license](LICENSE).
