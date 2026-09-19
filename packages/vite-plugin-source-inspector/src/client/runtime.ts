import type { ClientOptions } from './types.ts';

const uiAttribute = 'data-source-inspector-ui';
/** Gap between the highlight box and its label, and the label's minimum viewport inset. */
const labelGap = 4;
/** The inspector has to sit above whatever the app stacks, so it takes the ceiling. */
const topLayer = 2147483647;
/** One below, so the label and the button stay readable over the highlight. */
const highlightLayer = topLayer - 1;
const sourceValuePattern = /^(?<file>.*):(?<line>\d+):(?<column>\d+)$/u;
/** Crosshair, drawn inline so the button stays icon-sized and needs no asset. */
const controlIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>';
const modifierProps = {
  alt: 'altKey',
  ctrl: 'ctrlKey',
  meta: 'metaKey',
  shift: 'shiftKey',
} as const;

/**
 * Flattens CSS declarations into a `cssText` string. Written as records rather than one
 * long line so each element's styling stays scannable; `undefined` values are dropped, so
 * a partially filled record (the button's placement) can be spread straight in.
 */
function css(declarations: Record<string, string | undefined>): string {
  let cssText = '';
  for (const [property, value] of Object.entries(declarations)) {
    if (value !== undefined) cssText += `${property}:${value};`;
  }
  return cssText;
}

/**
 * The browser half of the inspector. It is served as a single standalone module, so it
 * must not import anything at runtime — type-only imports are erased and therefore fine.
 */
export function createInspector(options: ClientOptions): () => void {
  const root = document.body;
  const controller = new AbortController();
  const { signal } = controller;
  let enabled = readStoredState();
  let hovered: Element | undefined;

  function readStoredState(): boolean {
    if (!options.persist) return options.defaultEnabled;
    try {
      const stored = sessionStorage.getItem(options.storageKey);
      return stored === null ? options.defaultEnabled : stored === 'true';
    } catch {
      return options.defaultEnabled;
    }
  }

  function writeStoredState(value: boolean): void {
    if (!options.persist) return;
    try {
      sessionStorage.setItem(options.storageKey, String(value));
    } catch {
      // Storage can be unavailable (private mode, restricted extension contexts).
    }
  }

  const box = document.createElement('div');
  box.setAttribute(uiAttribute, 'box');
  box.style.cssText = css({
    position: 'fixed',
    top: '0',
    left: '0',
    display: 'none',
    'box-sizing': 'border-box',
    // The box tracks the pointer, so it must never intercept it.
    'pointer-events': 'none',
    'z-index': String(highlightLayer),
    background: options.highlight.background,
    border: `1px solid ${options.highlight.color}`,
    'border-radius': '2px',
  });

  const label = document.createElement('div');
  label.setAttribute(uiAttribute, 'label');
  label.style.cssText = css({
    position: 'fixed',
    top: '0',
    left: '0',
    display: 'none',
    'pointer-events': 'none',
    'z-index': String(topLayer),
    'max-width': 'calc(100vw - 8px)',
    padding: '2px 6px',
    background: '#111827',
    'border-radius': '4px',
    'box-shadow': '0 2px 8px rgb(0 0 0 / 35%)',
    color: '#fff',
    font: '500 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
  });

  const cursorStyle = document.createElement('style');
  cursorStyle.setAttribute(uiAttribute, 'cursor');
  cursorStyle.textContent = '*{cursor:crosshair !important;}';

  const control = document.createElement('button');
  control.type = 'button';
  control.setAttribute(uiAttribute, 'control');
  control.innerHTML = controlIcon;
  control.style.cssText = css({
    position: 'fixed',
    // Already resolved from the `toggleButton.position` option: the viewport edges to pin,
    // plus the pull-back transform the `center-*` anchors need.
    ...options.button.placement,
    'z-index': String(topLayer),
    display: 'grid',
    'place-items': 'center',
    width: '28px',
    height: '28px',
    padding: '0',
    background: '#111827',
    border: '0',
    'border-radius': '999px',
    'box-shadow': '0 4px 12px rgb(0 0 0 / 25%)',
    color: '#fff',
    cursor: 'pointer',
    // `!important` because a host stylesheet that blanket-disables pointer events would
    // otherwise leave the toggle unclickable.
    'pointer-events': 'all !important',
  });

  root.append(box, label);
  if (options.button.show) root.append(control);

  const isInspectorUi = (target: Element) => target.closest(`[${uiAttribute}]`) !== null;

  const eventTarget = (event: Event): Element | undefined => {
    const target = event.composedPath()[0] ?? event.target;
    return target instanceof Element ? target : undefined;
  };

  const findSourceElement = (event: Event): Element | null => {
    const target = eventTarget(event);
    if (target === undefined || isInspectorUi(target)) return null;
    return target.closest(`[${options.attribute}]`);
  };

  const hotkeyHeld = (event: Event): boolean =>
    options.hotkey.length > 0 &&
    event instanceof MouseEvent &&
    options.hotkey.every((key) => event[modifierProps[key]]);

  /** Inspect mode is either toggled on, or temporarily held via the hotkey. */
  const isActive = (event: Event): boolean => enabled || hotkeyHeld(event);

  function hideHighlight(): void {
    hovered = undefined;
    box.style.display = 'none';
    label.style.display = 'none';
  }

  function drawHighlight(element: Element): void {
    const value = element.getAttribute(options.attribute);
    if (value === null) {
      hideHighlight();
      return;
    }

    hovered = element;
    const rect = element.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;

    if (!options.highlight.showLabel) return;

    label.textContent = value;
    label.style.display = 'block';
    const labelRect = label.getBoundingClientRect();
    const above = rect.top - labelRect.height - labelGap;
    const below = Math.min(
      rect.bottom + labelGap,
      window.innerHeight - labelRect.height - labelGap,
    );

    label.style.left = `${Math.max(labelGap, Math.min(rect.left, window.innerWidth - labelRect.width - labelGap))}px`;
    label.style.top = `${above >= labelGap ? above : below}px`;
  }

  function setEnabled(value: boolean): void {
    enabled = value;
    writeStoredState(value);

    // The button is icon-only, so the state lives in the tooltip and the accessible name.
    const title = `${options.button.label}: ${enabled ? 'on' : 'off'}`;
    control.title = title;
    control.setAttribute('aria-label', title);
    control.setAttribute('aria-pressed', String(enabled));
    control.style.background = enabled ? '#2563eb' : '#111827';
    control.style.opacity = enabled ? '1' : '0.65';

    if (enabled) {
      document.head.append(cursorStyle);
    } else {
      cursorStyle.remove();
      hideHighlight();
    }
  }

  function openInEditor(value: string): void {
    const location = sourceValuePattern.exec(value)?.groups;
    if (location === undefined) {
      console.warn('[source-inspector] unreadable source location', value);
      return;
    }

    const query = `file=${encodeURIComponent(location['file'] ?? '')}&line=${location['line'] ?? ''}&column=${location['column'] ?? ''}`;

    fetch(`${options.openUrl}?${query}`, { method: 'POST' }).catch((error: unknown) => {
      console.error('[source-inspector] could not reach the dev server', error);
    });
  }

  control.addEventListener(
    'click',
    (event) => {
      event.stopImmediatePropagation();
      setEnabled(!enabled);
    },
    { signal },
  );

  document.addEventListener(
    'pointermove',
    (event) => {
      const element = isActive(event) ? findSourceElement(event) : null;
      if (element === null) {
        hideHighlight();
        return;
      }
      drawHighlight(element);
    },
    { capture: true, signal },
  );

  document.addEventListener('pointerleave', hideHighlight, { capture: true, signal });
  window.addEventListener('blur', hideHighlight, { signal });

  window.addEventListener(
    'scroll',
    () => {
      if (hovered?.isConnected === true) drawHighlight(hovered);
      else hideHighlight();
    },
    { capture: true, passive: true, signal },
  );

  // Capture on `window`, which runs before anything in the document tree: UI libraries
  // routinely swallow Escape to close their own overlays.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!options.escapeToExit || event.key !== 'Escape' || !enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setEnabled(false);
    },
    { capture: true, signal },
  );

  // Keep the page from reacting to the pointer while inspecting.
  const suppressEvent = (event: Event): void => {
    const target = eventTarget(event);
    if (!isActive(event) || (target !== undefined && isInspectorUi(target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) {
    document.addEventListener(type, suppressEvent, { capture: true, signal });
  }

  document.addEventListener(
    'click',
    (event) => {
      if (!isActive(event)) return;
      const target = eventTarget(event);
      if (target !== undefined && isInspectorUi(target)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const value = findSourceElement(event)?.getAttribute(options.attribute);
      if (value === null || value === undefined) {
        console.warn('[source-inspector] no instrumented element under the pointer');
        return;
      }

      openInEditor(value);
      // One inspection is usually all you want: hand the app back straight away.
      if (options.exitAfterClick) setEnabled(false);
    },
    { capture: true, signal },
  );

  setEnabled(enabled);

  return () => {
    controller.abort();
    cursorStyle.remove();
    box.remove();
    label.remove();
    control.remove();
  };
}
