/** Modifier keys that can be held to inspect without toggling inspect mode on. */
export type ModifierKey = 'alt' | 'ctrl' | 'meta' | 'shift';

/** Editors with a built-in "open at line/column" command. */
export type KnownEditor =
  | 'atom'
  | 'code'
  | 'code-insiders'
  | 'cursor'
  | 'emacs'
  | 'idea'
  | 'phpstorm'
  | 'pycharm'
  | 'sublime'
  | 'vscodium'
  | 'webstorm'
  | 'windsurf'
  | 'zed';

/**
 * A custom editor invocation. `args` supports the `{file}`, `{line}` and `{column}`
 * placeholders, which are substituted before the command is spawned.
 */
export interface EditorCommand {
  command: string;
  args?: string[];
}

/**
 * A known editor, any other binary name (treated as a VS Code style CLI), or a full
 * custom command. The `Record<never, never>` keeps editor-name autocomplete alive.
 */
export type EditorOption = EditorCommand | KnownEditor | (Record<never, never> & string);

/** Named spot to pin the toggle button to, `offset` away from the viewport edges. */
export type ToggleButtonAnchor =
  | 'bottom-left'
  | 'bottom-right'
  | 'center-left'
  | 'center-right'
  | 'top-left'
  | 'top-right';

/**
 * Explicit distances from the viewport edges, in pixels. Whichever axis is left out falls
 * back to the default corner — `{ top: 80 }` sits 80px down the right-hand edge.
 */
export interface ToggleButtonInset {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

export type ToggleButtonPosition = ToggleButtonAnchor | ToggleButtonInset;

export interface ToggleButtonOptions {
  /** Render the floating toggle button. @default true */
  show?: boolean;
  /** An anchor name, or explicit pixel insets. @default 'bottom-right' */
  position?: ToggleButtonPosition;
  /** Distance from the viewport edges for anchored positions. @default 12 */
  offset?: number;
  /** Text shown before the on/off state. @default 'Inspect source' */
  label?: string;
}

export interface HighlightOptions {
  /** Border colour of the highlight box. @default '#3b82f6' */
  color?: string;
  /** Fill colour of the highlight box. @default 'rgb(59 130 246 / 18%)' */
  background?: string;
  /** Show the `file:line:column` label next to the highlight. @default true */
  showLabel?: boolean;
}

export interface SourceInspectorOptions {
  /**
   * Turn the plugin on. Defaults to `true` during `vite serve` and `false` for builds —
   * instrumentation is a development-only concern.
   */
  enabled?: boolean;
  /**
   * Only instrument files whose path matches. Strings are treated as path prefixes
   * relative to the Vite root. @default ['src']
   */
  include?: (RegExp | string)[];
  /** Skip files whose path matches. Strings are path prefixes relative to the Vite root. */
  exclude?: (RegExp | string)[];
  /** File extensions to instrument. @default ['.jsx', '.tsx'] */
  extensions?: string[];
  /** DOM attribute holding the source location. @default 'data-source-inspector-file' */
  attribute?: string;
  /** Base path of the plugin's dev-server routes. @default '/__source-inspector' */
  endpoint?: string;
  /** Dev-server port the client calls. Defaults to the resolved Vite server port. */
  port?: number;
  /** Dev-server host the client calls. @default 'localhost' */
  host?: string;
  /** Full origin the client calls. Wins over `host`/`port`. */
  serverOrigin?: string;
  /**
   * Editor to open files in. Defaults to `$SOURCE_INSPECTOR_EDITOR`, then `$EDITOR`,
   * then `'code'`.
   */
  editor?: EditorOption;
  /**
   * Modifiers held to inspect while inspect mode is off. Pass `false` to require the
   * toggle. @default ['alt', 'shift']
   */
  hotkey?: ModifierKey[] | false;
  /**
   * Floating toggle button. Pass `false` to hide it entirely, or an object to move it:
   * `{ position: 'center-left' }`, `{ position: { top: 80, left: 24 } }`.
   */
  toggleButton?: ToggleButtonOptions | boolean;
  /** Start with inspect mode already on. @default false */
  defaultEnabled?: boolean;
  /** Remember the on/off state in `sessionStorage`. @default true */
  persist?: boolean;
  /** Let `Escape` leave inspect mode. @default true */
  escapeToExit?: boolean;
  /**
   * Leave inspect mode once a click has opened a file, so the app is usable again straight
   * away. Set to `false` to keep inspecting until the toggle or `Escape`. @default true
   */
  exitAfterClick?: boolean;
  /** Appearance of the hover highlight. */
  highlight?: HighlightOptions;
  /**
   * Which HTML entry points get the client injected. A `RegExp` or predicate receives the
   * HTML file path. @default true
   */
  injectClient?: RegExp | boolean | ((htmlPath: string) => boolean);
  /** Log instrumentation and editor activity to the Vite terminal. @default false */
  verbose?: boolean;
}
