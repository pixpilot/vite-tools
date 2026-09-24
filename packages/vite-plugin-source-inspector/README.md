# vite-plugin-source-inspector

A Vite plugin that adds source locations to JSX/TSX elements, letting you open the
matching file directly from the browser during development.

## Install

```sh
pnpm add -D @pixpilot/vite-plugin-source-inspector
```

`typescript` (5.x or 6.x) is a peer dependency: the plugin parses JSX with your
project's compiler rather than bundling its own.

## Usage

Add the plugin to your Vite config:

```ts
import { sourceInspectorPlugin } from '@pixpilot/vite-plugin-source-inspector';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sourceInspectorPlugin()],
});
```

Start the Vite development server, toggle **Inspect source** in the browser, then
click an element to open its source location in your editor. Hold <kbd>Alt</kbd> +
<kbd>Shift</kbd> to inspect without toggling the mode on.

## Options

```ts
sourceInspectorPlugin({
  editor: 'cursor',
  include: ['src'],
  hotkey: ['alt', 'shift'],
  toggleButton: { position: 'bottom-right' },
});
```

The plugin instruments `.jsx` and `.tsx` files under `src` by default. It runs only
while serving, and it opens files with the `code` command unless `editor`,
`SOURCE_INSPECTOR_EDITOR`, or `EDITOR` specifies another editor. Set `enabled: true`
to enable it outside the default development-server behavior.
