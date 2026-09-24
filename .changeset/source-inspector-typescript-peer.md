---
'@pixpilot/vite-plugin-source-inspector': patch
---

Make `typescript` a peer dependency (`^5.0.0 || ^6.0.0`) instead of a direct dependency, so the plugin uses the host project's compiler rather than installing a second copy.
