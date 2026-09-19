import type { ButtonPlacement, ClientOptions } from './client/types.ts';
import type {
  EditorCommand,
  SourceInspectorOptions,
  ToggleButtonAnchor,
  ToggleButtonInset,
  ToggleButtonOptions,
  ToggleButtonPosition,
} from './types.ts';
import process from 'node:process';
import { resolveEditor } from './editors.ts';

const defaultButtonOffset = 12;
const defaultButtonAnchor: ToggleButtonAnchor = 'bottom-right';

export const defaultAttribute = 'data-source-inspector-file';
export const defaultEndpoint = '/__source-inspector';
export const clientRoute = 'client.js';

export interface ResolveContext {
  root: string;
  port: number;
}

export interface ResolvedOptions {
  include: (RegExp | string)[];
  exclude: (RegExp | string)[];
  extensions: string[];
  attribute: string;
  endpoint: string;
  origin: string;
  editor: EditorCommand;
  verbose: boolean;
  clientUrl: string;
  injectClient: (htmlPath: string) => boolean;
  client: ClientOptions;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

function normalizePrefix(prefix: string): string {
  return prefix.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+$/u, '');
}

/** Strips a leading and trailing slash so `endpoint` can be written either way. */
function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.replaceAll(/^\/+|\/+$/gu, '');
  return trimmed === '' ? defaultEndpoint : `/${trimmed}`;
}

/**
 * Matches a root-relative posix path against the include/exclude filters. Strings are
 * path prefixes; regular expressions are tested against the whole relative path.
 */
export function matchesFilter(
  relativePath: string,
  filters: (RegExp | string)[],
): boolean {
  return filters.some((filter) => {
    if (typeof filter !== 'string') return filter.test(relativePath);
    const prefix = normalizePrefix(filter);
    return (
      prefix === '' || relativePath === prefix || relativePath.startsWith(`${prefix}/`)
    );
  });
}

function normalizeToggleButton(
  toggleButton: SourceInspectorOptions['toggleButton'],
): ToggleButtonOptions {
  if (toggleButton === false) return { show: false };
  if (toggleButton === undefined || toggleButton === true) return {};
  return toggleButton;
}

/** `center-*` pins the midpoint of the button, so it also needs the pull-back transform. */
function resolveAnchorPlacement(
  anchor: ToggleButtonAnchor,
  offset: number,
): ButtonPlacement {
  const inset = `${offset}px`;
  const placement: ButtonPlacement = anchor.endsWith('left')
    ? { left: inset }
    : { right: inset };

  if (anchor.startsWith('center')) {
    placement.top = '50%';
    placement.transform = 'translateY(-50%)';
  } else if (anchor.startsWith('top')) {
    placement.top = inset;
  } else {
    placement.bottom = inset;
  }

  return placement;
}

function resolveInsetPlacement(
  inset: ToggleButtonInset,
  offset: number,
): ButtonPlacement {
  const placement: ButtonPlacement = {};
  if (inset.top !== undefined) placement.top = `${inset.top}px`;
  if (inset.right !== undefined) placement.right = `${inset.right}px`;
  if (inset.bottom !== undefined) placement.bottom = `${inset.bottom}px`;
  if (inset.left !== undefined) placement.left = `${inset.left}px`;

  // An axis nobody pinned would leave the button at the top-left of the viewport, so fall
  // back to the default corner for whichever one was left out.
  const fallback = resolveAnchorPlacement(defaultButtonAnchor, offset);
  if (placement.top === undefined && placement.bottom === undefined) {
    if (fallback.bottom !== undefined) placement.bottom = fallback.bottom;
  }
  if (placement.left === undefined && placement.right === undefined) {
    if (fallback.right !== undefined) placement.right = fallback.right;
  }

  return placement;
}

function resolveButtonPlacement(
  position: ToggleButtonPosition | undefined,
  offset: number,
): ButtonPlacement {
  if (position === undefined) return resolveAnchorPlacement(defaultButtonAnchor, offset);
  if (typeof position === 'string') return resolveAnchorPlacement(position, offset);
  return resolveInsetPlacement(position, offset);
}

function resolveInjectClient(
  injectClient: SourceInspectorOptions['injectClient'],
): (htmlPath: string) => boolean {
  if (injectClient === undefined || injectClient === true) return () => true;
  if (injectClient === false) return () => false;
  if (typeof injectClient === 'function') return injectClient;
  return (htmlPath) => injectClient.test(htmlPath);
}

export function resolveOptions(
  options: SourceInspectorOptions,
  context: ResolveContext,
): ResolvedOptions {
  const endpoint = normalizeEndpoint(options.endpoint ?? defaultEndpoint);
  const host = options.host ?? 'localhost';
  const origin = options.serverOrigin ?? `http://${host}:${options.port ?? context.port}`;
  const attribute = options.attribute ?? defaultAttribute;

  const button = normalizeToggleButton(options.toggleButton);
  const highlight = options.highlight ?? {};

  return {
    include: options.include ?? ['src'],
    exclude: options.exclude ?? [],
    extensions: options.extensions ?? ['.jsx', '.tsx'],
    attribute,
    endpoint,
    origin,
    editor: resolveEditor(
      options.editor ?? readEnv('SOURCE_INSPECTOR_EDITOR') ?? readEnv('EDITOR') ?? 'code',
    ),
    verbose: options.verbose ?? false,
    clientUrl: `${endpoint}/${clientRoute}`,
    injectClient: resolveInjectClient(options.injectClient),
    client: {
      attribute,
      openUrl: `${origin}${endpoint}/open`,
      hotkey: options.hotkey === false ? [] : (options.hotkey ?? ['alt', 'shift']),
      defaultEnabled: options.defaultEnabled ?? false,
      persist: options.persist ?? true,
      escapeToExit: options.escapeToExit ?? true,
      exitAfterClick: options.exitAfterClick ?? true,
      storageKey: `source-inspector:${endpoint}`,
      button: {
        show: button.show ?? true,
        placement: resolveButtonPlacement(
          button.position,
          button.offset ?? defaultButtonOffset,
        ),
        label: button.label ?? 'Inspect source',
      },
      highlight: {
        color: highlight.color ?? '#3b82f6',
        background: highlight.background ?? 'rgb(59 130 246 / 18%)',
        showLabel: highlight.showLabel ?? true,
      },
    },
  };
}
