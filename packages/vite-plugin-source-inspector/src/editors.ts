import type { EditorCommand, EditorOption, KnownEditor } from './types.ts';
import process from 'node:process';

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

/** What `spawn` needs in order to launch an editor on the current platform. */
export interface SpawnPlan {
  command: string;
  args: string[];
  windowsVerbatimArguments: boolean;
}

/**
 * `cmd.exe` splits the line it is handed on whitespace, so every part has to carry its
 * own quotes. A quote inside an argument is doubled, the way `cmd` expects it.
 */
function quoteForCmd(argument: string): string {
  if (!/[\s"]/u.test(argument)) return argument;
  return `"${argument.replaceAll('"', '""')}"`;
}

/**
 * Turns a resolved editor into a spawnable command.
 *
 * Editors reach Windows as `.cmd` shims, which only run through `cmd.exe`. Node's
 * `shell: true` gets us there, but it joins the arguments with a space and quotes none
 * of them, so `C:\Users\Ada Lovelace\app\src\App.tsx:12:5` arrives as two arguments and
 * the editor opens a blank window instead of the file. Build the line here instead,
 * quote each part, and hand it over verbatim.
 */
export function buildSpawnPlan(
  editor: EditorCommand,
  location: SourceLocation,
  platform: string,
): SpawnPlan {
  const args = buildEditorArgs(editor, location);
  if (platform !== 'win32') {
    return { command: editor.command, args, windowsVerbatimArguments: false };
  }

  const line = [editor.command, ...args].map(quoteForCmd).join(' ');
  return {
    command: process.env['ComSpec'] ?? 'cmd.exe',
    // The outer quotes are the pair `/s` strips back off before running the line.
    args: ['/d', '/s', '/c', `"${line}"`],
    windowsVerbatimArguments: true,
  };
}
