import type { ModifierKey } from '../types.ts';

/**
 * The toggle button's position resolved to CSS declarations, so the runtime only has to
 * spread them onto the element. Keys are CSS property names.
 */
export interface ButtonPlacement {
  bottom?: string;
  left?: string;
  right?: string;
  top?: string;
  transform?: string;
}

/**
 * The slice of the resolved options that is serialised into the browser bundle.
 * Everything here has to survive `JSON.stringify`.
 */
export interface ClientOptions {
  attribute: string;
  openUrl: string;
  hotkey: ModifierKey[];
  defaultEnabled: boolean;
  persist: boolean;
  escapeToExit: boolean;
  exitAfterClick: boolean;
  storageKey: string;
  button: {
    show: boolean;
    placement: ButtonPlacement;
    label: string;
  };
  highlight: {
    color: string;
    background: string;
    showLabel: boolean;
  };
}
