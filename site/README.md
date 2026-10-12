# Upload History website

Static marketing site for GitHub Pages. No framework, runtime dependencies, third-party fonts, analytics, or cookies.

## Preview

From the project root:

```sh
npm run site:build
npm run site:dev
```

Open http://127.0.0.1:4173/Upload-History/. After editing, build again and refresh.

## Structure

- `index.html`: homepage shell.
- `sitemap.xml`: public page URLs, copied into the build; update when adding pages.
- `partials/`: assignment demo, how-it-works, installation, and FAQ sections.
- `assets/css/`: shared, homepage, demo, and privacy styles.
- `assets/js/`: sample data, archive interaction, and installation clipboard control.
- `assets/fonts/`: self-hosted Manrope and its license.
- `privacy-shell.html`: website layout around the policy from `../public/privacy.html`.

The build writes `.output/site/`; that directory is generated and ignored. The assignment demo accepts a bundled fictional sample or a user-selected file. Submit reads an independent copy into memory and adds a timestamped download to the adjacent history panel. Nothing is sent to a server or persisted across refreshes. Reset clears the selection, copies, and download URLs. Demo limits are 10 MiB per file and five saved records (50 MiB total).

## Publish

Set the repository's **Settings → Pages → Source** to **GitHub Actions**, then push to `main`. The **Publish website** workflow builds and deploys the site, then checks the home and privacy URLs without authentication.

- Home: https://haoming9527.github.io/Upload-History/
- Privacy: https://haoming9527.github.io/Upload-History/privacy.html
- Sitemap: https://haoming9527.github.io/Upload-History/sitemap.xml

The installation links currently point to the local-build guide. When the Chrome Web Store listing is live, replace the primary installation links with the verified listing URL and update the availability copy. Do not invent a store URL or display an available-to-install claim before publication.
