---
'@pixpilot/vite-plugin-source-inspector': patch
---

Ship the browser runtime in the published package. The build only emitted `src/index.ts`,
so `dist` never contained `client/runtime.js` and the dev server threw
`could not locate the browser runtime next to the plugin` on the first client request.
It now builds as its own entry alongside the plugin.
