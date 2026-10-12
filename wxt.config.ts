import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT infers these from runtime content matches and the history entrypoint.
      // Capture is registered only after optional permission consent; this is our
      // archive page, never a replacement for Chrome's own browsing history.
      delete manifest.host_permissions;
      delete manifest.chrome_url_overrides;
    },
  },
  manifest: {
    name: 'Upload History',
    description: 'Remember files you attach to websites and recover a private local copy later.',
    minimum_chrome_version: '148',
    permissions: ['storage', 'scripting', 'alarms'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    incognito: 'not_allowed',
    homepage_url: 'https://github.com/Haoming9527/Upload-History',
    icons: { 16: '/icon/16.png', 32: '/icon/32.png', 48: '/icon/48.png', 128: '/icon/128.png' },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
  },
});
