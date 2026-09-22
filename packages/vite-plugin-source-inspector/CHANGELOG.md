# @pixpilot/vite-plugin-source-inspector

## 0.3.0

### Minor Changes

- implement buildSpawnPlan for editor launching

## 0.2.0

### Minor Changes

- add browser runtime as a separate entry

### Patch Changes

- 12a0a6e: Ship the browser runtime in the published package. The build only emitted `src/index.ts`,
  so `dist` never contained `client/runtime.js` and the dev server threw
  `could not locate the browser runtime next to the plugin` on the first client request.
  It now builds as its own entry alongside the plugin.

## 0.1.1

### Patch Changes

- 7d2872b: new release

## 0.1.0

### Minor Changes

- add vite-plugin-source-inspector package and remove example-package
