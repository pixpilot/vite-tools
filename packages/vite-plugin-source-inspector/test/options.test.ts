import type { SourceInspectorOptions } from '../src/types.ts';
import { describe, expect, it } from 'vitest';
import { matchesFilter, resolveOptions } from '../src/options.ts';

const context = { root: '/project', port: 4000 };

describe('resolveOptions', () => {
  it('falls back to sensible defaults', () => {
    const resolved = resolveOptions({}, context);

    expect(resolved.include).toStrictEqual(['src']);
    expect(resolved.extensions).toStrictEqual(['.jsx', '.tsx']);
    expect(resolved.origin).toBe('http://localhost:4000');
    expect(resolved.clientUrl).toBe('/__source-inspector/client.js');
    expect(resolved.client.openUrl).toBe('http://localhost:4000/__source-inspector/open');
    expect(resolved.client.hotkey).toStrictEqual(['alt', 'shift']);
    expect(resolved.client.button.show).toBe(true);
    expect(resolved.client.exitAfterClick).toBe(true);
  });

  it('can be told to stay in inspect mode after opening a file', () => {
    expect(resolveOptions({ exitAfterClick: false }, context).client.exitAfterClick).toBe(
      false,
    );
  });

  it('builds the origin from a custom host and port', () => {
    const resolved = resolveOptions({ host: '127.0.0.1', port: 5199 }, context);

    expect(resolved.origin).toBe('http://127.0.0.1:5199');
  });

  it('lets serverOrigin win over host and port', () => {
    const resolved = resolveOptions(
      { host: '127.0.0.1', port: 5199, serverOrigin: 'http://dev.local:80' },
      context,
    );

    expect(resolved.origin).toBe('http://dev.local:80');
  });

  it('normalises the endpoint however it is written', () => {
    expect(resolveOptions({ endpoint: 'inspect/' }, context).clientUrl).toBe(
      '/inspect/client.js',
    );
    expect(resolveOptions({ endpoint: '/inspect' }, context).clientUrl).toBe(
      '/inspect/client.js',
    );
  });

  it('scopes the storage key to the endpoint so two servers do not share state', () => {
    expect(resolveOptions({ endpoint: '/a' }, context).client.storageKey).not.toBe(
      resolveOptions({ endpoint: '/b' }, context).client.storageKey,
    );
  });

  it('turns a disabled hotkey into an empty modifier list', () => {
    expect(resolveOptions({ hotkey: false }, context).client.hotkey).toStrictEqual([]);
  });

  it('hides the toggle button when it is disabled', () => {
    expect(resolveOptions({ toggleButton: false }, context).client.button.show).toBe(
      false,
    );
  });

  it('keeps partial toggle button options and fills in the rest', () => {
    const { button } = resolveOptions(
      { toggleButton: { position: 'top-left' } },
      context,
    ).client;

    expect(button).toStrictEqual({
      show: true,
      placement: { top: '12px', left: '12px' },
      label: 'Inspect source',
    });
  });

  describe('toggle button placement', () => {
    const placementOf = (toggleButton: SourceInspectorOptions['toggleButton']) =>
      resolveOptions(toggleButton === undefined ? {} : { toggleButton }, context).client
        .button.placement;

    it('defaults to the bottom-right corner', () => {
      expect(placementOf(undefined)).toStrictEqual({ right: '12px', bottom: '12px' });
    });

    it('pins each corner with the configured offset', () => {
      expect(placementOf({ position: 'top-right', offset: 20 })).toStrictEqual({
        right: '20px',
        top: '20px',
      });
      expect(placementOf({ position: 'bottom-left', offset: 0 })).toStrictEqual({
        left: '0px',
        bottom: '0px',
      });
    });

    it('centres the button vertically for the center anchors', () => {
      expect(placementOf({ position: 'center-left' })).toStrictEqual({
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
      });
      expect(placementOf({ position: 'center-right', offset: 4 })).toStrictEqual({
        right: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
      });
    });

    it('accepts explicit pixel insets', () => {
      expect(placementOf({ position: { top: 80, left: 24 } })).toStrictEqual({
        top: '80px',
        left: '24px',
      });
    });

    it('falls back to the default corner on an axis the insets leave out', () => {
      expect(placementOf({ position: { top: 80 } })).toStrictEqual({
        top: '80px',
        right: '12px',
      });
      expect(placementOf({ position: { left: 24 }, offset: 30 })).toStrictEqual({
        left: '24px',
        bottom: '30px',
      });
    });

    it('ignores the offset once both axes are pinned explicitly', () => {
      expect(
        placementOf({ position: { bottom: 10, right: 10 }, offset: 99 }),
      ).toStrictEqual({ bottom: '10px', right: '10px' });
    });
  });

  it('carries the custom attribute into the client options', () => {
    expect(resolveOptions({ attribute: 'data-loc' }, context).client.attribute).toBe(
      'data-loc',
    );
  });

  describe('injectClient', () => {
    it('injects everywhere by default', () => {
      expect(resolveOptions({}, context).injectClient('/project/views/popup.html')).toBe(
        true,
      );
    });

    it('accepts a regular expression', () => {
      const { injectClient } = resolveOptions({ injectClient: /sidepanel/u }, context);

      expect(injectClient('/project/views/sidepanel.html')).toBe(true);
      expect(injectClient('/project/views/popup.html')).toBe(false);
    });

    it('accepts a predicate', () => {
      const { injectClient } = resolveOptions(
        { injectClient: (path) => path.endsWith('popup.html') },
        context,
      );

      expect(injectClient('/project/views/popup.html')).toBe(true);
      expect(injectClient('/project/views/sidepanel.html')).toBe(false);
    });

    it('never injects when disabled', () => {
      expect(
        resolveOptions({ injectClient: false }, context).injectClient('anything'),
      ).toBe(false);
    });
  });
});

describe('matchesFilter', () => {
  it('treats strings as directory prefixes', () => {
    expect(matchesFilter('src/ui/App.tsx', ['src/ui'])).toBe(true);
    expect(matchesFilter('src/background/index.tsx', ['src/ui'])).toBe(false);
  });

  it('does not match a prefix that only shares a name fragment', () => {
    expect(matchesFilter('src/uikit/App.tsx', ['src/ui'])).toBe(false);
  });

  it('accepts windows-style and dot-prefixed filters', () => {
    expect(matchesFilter('src/ui/App.tsx', ['./src\\ui/'])).toBe(true);
  });

  it('matches the filter path itself', () => {
    expect(matchesFilter('src', ['src'])).toBe(true);
  });

  it('supports regular expressions', () => {
    expect(matchesFilter('src/ui/App.tsx', [/\/ui\//u])).toBe(true);
    expect(matchesFilter('src/lib/App.tsx', [/\/ui\//u])).toBe(false);
  });

  it('is false for an empty filter list', () => {
    expect(matchesFilter('src/ui/App.tsx', [])).toBe(false);
  });
});
