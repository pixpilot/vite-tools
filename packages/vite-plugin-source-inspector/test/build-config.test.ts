import { describe, expect, it } from 'vitest';
import config from '../tsdown.config.ts';

/**
 * The plugin reads the browser runtime off disk at request time, so it only works once
 * published if the build emits it next to `dist/index.js`. Bundling it into the plugin
 * entry instead would leave `readClientSource` with nothing to find.
 */
describe('tsdown config', () => {
  it('builds the browser runtime as its own entry', () => {
    expect(config.entry).toContain('src/client/runtime.ts');
  });
});
