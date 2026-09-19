import type { EditorCommand, EditorOption, KnownEditor } from './types.ts';

const gotoArgs = ['--goto', '{file}:{line}:{column}'];
const jetBrainsArgs = ['--line', '{line}', '--column', '{column}', '{file}'];
const suffixArgs = ['{file}:{line}:{column}'];

/** Launch recipes for editors that accept a file/line/column on the command line. */
export const knownEditors: Record<KnownEditor, EditorCommand> = {
  atom: { command: 'atom', args: suffixArgs },
  code: { command: 'code', args: gotoArgs },
  'code-insiders': { command: 'code-insiders', args: gotoArgs },
  cursor: { command: 'cursor', args: gotoArgs },
  emacs: { command: 'emacsclient', args: ['+{line}:{column}', '{file}'] },
  idea: { command: 'idea', args: jetBrainsArgs },
  phpstorm: { command: 'phpstorm', args: jetBrainsArgs },
  pycharm: { command: 'pycharm', args: jetBrainsArgs },
  sublime: { command: 'subl', args: suffixArgs },
  vscodium: { command: 'codium', args: gotoArgs },
  webstorm: { command: 'webstorm', args: jetBrainsArgs },
  windsurf: { command: 'windsurf', args: gotoArgs },
  zed: { command: 'zed', args: suffixArgs },
};

function isKnownEditor(editor: string): editor is KnownEditor {
  return Object.hasOwn(knownEditors, editor);
}

/**
 * Turns an editor option into a spawnable command. Unknown names fall back to
 * `<name> --goto file:line:column`, which covers the many VS Code forks.
 */
export function resolveEditor(editor: EditorOption | undefined): EditorCommand {
  if (editor === undefined) return knownEditors.code;
  if (typeof editor !== 'string') return editor;
  return isKnownEditor(editor)
    ? knownEditors[editor]
    : { command: editor, args: gotoArgs };
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/** Substitutes the `{file}`, `{line}` and `{column}` placeholders. */
export function buildEditorArgs(
  editor: EditorCommand,
  location: SourceLocation,
): string[] {
  const args = editor.args ?? gotoArgs;
  return args.map((arg) =>
    arg
      .replaceAll('{file}', location.file)
      .replaceAll('{line}', String(location.line))
      .replaceAll('{column}', String(location.column)),
  );
}
