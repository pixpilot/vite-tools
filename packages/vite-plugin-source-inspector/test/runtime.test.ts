// @vitest-environment jsdom
import type { ClientOptions } from '../src/client/types.ts';
import type { SourceInspectorOptions } from '../src/types.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInspector } from '../src/client/runtime.ts';
import { resolveOptions } from '../src/options.ts';

const uiSelector = '[data-source-inspector-ui]';

function clientOptions(options: SourceInspectorOptions = {}): ClientOptions {
  return resolveOptions(options, { root: '/project', port: 4000 }).client;
}

function mountTarget(location = 'src/App.tsx:3:5'): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('data-source-inspector-file', location);
  element.textContent = 'target';
  document.body.append(element);
  return element;
}

function pointer(type: string, target: Element, modifiers: MouseEventInit = {}): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, composed: true, ...modifiers }),
  );
}

function control(): HTMLButtonElement | null {
  return document.querySelector('[data-source-inspector-ui="control"]');
}

function box(): HTMLElement | null {
  return document.querySelector('[data-source-inspector-ui="box"]');
}

function label(): HTMLElement | null {
  return document.querySelector('[data-source-inspector-ui="label"]');
}

let dispose: (() => void) | undefined;
const fetchMock = vi.fn(async () => Promise.resolve({} as Response));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('createInspector', () => {
  it('mounts the toggle button with the configured label and corner', () => {
    dispose = createInspector(
      clientOptions({
        toggleButton: { label: 'Locate', position: 'top-left', offset: 20 },
      }),
    );

    expect(control()?.getAttribute('aria-label')).toBe('Locate: off');
    expect(control()?.title).toBe('Locate: off');
    expect(control()?.style.top).toBe('20px');
    expect(control()?.style.left).toBe('20px');
  });

  it('centres the button against an edge for the center anchors', () => {
    dispose = createInspector(
      clientOptions({ toggleButton: { position: 'center-left' } }),
    );

    expect(control()?.style.top).toBe('50%');
    expect(control()?.style.left).toBe('12px');
    expect(control()?.style.transform).toBe('translateY(-50%)');
  });

  it('places the button at explicit insets', () => {
    dispose = createInspector(
      clientOptions({ toggleButton: { position: { top: 80, left: 24 } } }),
    );

    expect(control()?.style.top).toBe('80px');
    expect(control()?.style.left).toBe('24px');
    expect(control()?.style.bottom).toBe('');
    expect(control()?.style.right).toBe('');
  });

  it('shows an icon rather than text so it stays out of the way', () => {
    dispose = createInspector(clientOptions());

    expect(control()?.textContent).toBe('');
    expect(control()?.querySelector('svg')).not.toBeNull();
  });

  it('leaves the button out when it is disabled', () => {
    dispose = createInspector(clientOptions({ toggleButton: false }));

    expect(control()).toBeNull();
    expect(box()).not.toBeNull();
  });

  it('does nothing on hover while inspect mode is off', () => {
    dispose = createInspector(clientOptions());
    pointer('pointermove', mountTarget());

    expect(box()?.style.display).toBe('none');
  });

  it('highlights the hovered element once inspect mode is on', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));
    pointer('pointermove', mountTarget());

    expect(box()?.style.display).toBe('block');
    expect(label()?.textContent).toBe('src/App.tsx:3:5');
  });

  it('highlights while the hotkey modifiers are held, without toggling', () => {
    dispose = createInspector(clientOptions({ hotkey: ['alt', 'shift'] }));
    const target = mountTarget();

    pointer('pointermove', target, { altKey: true });
    expect(box()?.style.display).toBe('none');

    pointer('pointermove', target, { altKey: true, shiftKey: true });
    expect(box()?.style.display).toBe('block');
  });

  it('never reacts to the hotkey when it is disabled', () => {
    dispose = createInspector(clientOptions({ hotkey: false }));
    pointer('pointermove', mountTarget(), { altKey: true, shiftKey: true });

    expect(box()?.style.display).toBe('none');
  });

  it('hides the highlight when the pointer leaves every instrumented element', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));
    const target = mountTarget();
    pointer('pointermove', target);

    const bare = document.createElement('section');
    document.body.append(bare);
    pointer('pointermove', bare);

    expect(box()?.style.display).toBe('none');
  });

  it('skips the label when it is turned off', () => {
    dispose = createInspector(
      clientOptions({ defaultEnabled: true, highlight: { showLabel: false } }),
    );
    pointer('pointermove', mountTarget());

    expect(box()?.style.display).toBe('block');
    expect(label()?.style.display).toBe('none');
  });

  it('asks the dev server to open the clicked source and swallows the click', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));
    const target = mountTarget('src/ui/App tab.tsx:12:7');
    const appHandler = vi.fn();
    target.addEventListener('click', appHandler);

    pointer('click', target);

    expect(appHandler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/__source-inspector/open?file=src%2Fui%2FApp%20tab.tsx&line=12&column=7',
      { method: 'POST' },
    );
  });

  it('leaves inspect mode after opening a file', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));

    pointer('click', mountTarget());

    expect(control()?.getAttribute('aria-pressed')).toBe('false');
    expect(box()?.style.display).toBe('none');
  });

  it('stays in inspect mode after opening when asked to', () => {
    dispose = createInspector(
      clientOptions({ defaultEnabled: true, exitAfterClick: false }),
    );

    pointer('click', mountTarget());

    expect(control()?.getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays in inspect mode when the click misses every instrumented element', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));
    const bare = document.createElement('section');
    document.body.append(bare);

    pointer('click', bare);

    expect(control()?.getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets clicks through while inspect mode is off', () => {
    dispose = createInspector(clientOptions());
    const target = mountTarget();
    const appHandler = vi.fn();
    target.addEventListener('click', appHandler);

    pointer('click', target);

    expect(appHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps its own button clickable while inspect mode is on', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));

    control()?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(control()?.getAttribute('aria-label')).toBe('Inspect source: off');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('toggles from the button and remembers the state', () => {
    const options = clientOptions();
    dispose = createInspector(options);

    control()?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(control()?.getAttribute('aria-pressed')).toBe('true');
    expect(sessionStorage.getItem(options.storageKey)).toBe('true');
  });

  it('restores a remembered state on the next page load', () => {
    const options = clientOptions();
    sessionStorage.setItem(options.storageKey, 'true');
    dispose = createInspector(options);

    expect(control()?.getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores stored state when persistence is off', () => {
    const options = clientOptions({ persist: false });
    sessionStorage.setItem(options.storageKey, 'true');
    dispose = createInspector(options);

    expect(control()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves inspect mode on Escape', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(control()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('still leaves inspect mode when the app swallows Escape', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));
    const appHandler = vi.fn((event: Event) => {
      event.stopPropagation();
    });
    document.addEventListener('keydown', appHandler, true);

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(control()?.getAttribute('aria-pressed')).toBe('false');
    expect(appHandler).not.toHaveBeenCalled();

    document.removeEventListener('keydown', appHandler, true);
  });

  it('leaves other keys to the app', () => {
    dispose = createInspector(clientOptions({ defaultEnabled: true }));
    const appHandler = vi.fn();
    document.addEventListener('keydown', appHandler);

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );

    expect(appHandler).toHaveBeenCalledTimes(1);
    expect(control()?.getAttribute('aria-pressed')).toBe('true');

    document.removeEventListener('keydown', appHandler);
  });

  it('stays in inspect mode on Escape when that is disabled', () => {
    dispose = createInspector(
      clientOptions({ defaultEnabled: true, escapeToExit: false }),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(control()?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reads a custom attribute name', () => {
    dispose = createInspector(
      clientOptions({ attribute: 'data-loc', defaultEnabled: true }),
    );
    const target = document.createElement('div');
    target.setAttribute('data-loc', 'src/App.tsx:1:1');
    document.body.append(target);

    pointer('pointermove', target);

    expect(label()?.textContent).toBe('src/App.tsx:1:1');
  });

  it('removes its UI and stops listening once disposed', () => {
    const stop = createInspector(clientOptions({ defaultEnabled: true }));
    const target = mountTarget();
    const appHandler = vi.fn();
    target.addEventListener('click', appHandler);

    stop();
    pointer('click', target);

    expect(document.querySelectorAll(uiSelector)).toHaveLength(0);
    expect(appHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
