import { defineConfig } from '@internal/tsdown-config';

export default defineConfig({
  // The browser runtime is a second entry rather than part of the plugin bundle: the
  // plugin reads it off disk and serves it to the page, so it has to survive publishing
  // as its own file next to `dist/index.js`.
  entry: ['src/index.ts', 'src/client/runtime.ts'],
  dts: true,
  minify: false,
  clean: true,
  // Keep `process.env.NODE_ENV` intact in the output so each consumer's bundler
  // (Next.js, Vite, etc.) can dead-code-eliminate dev-only guards in production.
  // A `browser` platform would inline it at build time, making dev-only code run
  // unconditionally in shipped bundles.
  platform: 'neutral',
});
