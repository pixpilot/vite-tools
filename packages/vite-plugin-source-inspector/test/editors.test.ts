import { describe, expect, it } from 'vitest';
import { buildEditorArgs, buildSpawnPlan, resolveEditor } from '../src/editors.ts';

const location = { file: '/project/src/App.tsx', line: 12, column: 3 };

describe('resolveEditor', () => {
  it('defaults to VS Code', () => {
    expect(resolveEditor(undefined).command).toBe('code');
  });

  it('resolves a known editor to its launch recipe', () => {
    expect(resolveEditor('webstorm')).toStrictEqual({
      command: 'webstorm',
      args: ['--line', '{line}', '--column', '{column}', '{file}'],
    });
  });

  it('maps editors whose binary differs from their name', () => {
    expect(resolveEditor('sublime').command).toBe('subl');
    expect(resolveEditor('vscodium').command).toBe('codium');
    expect(resolveEditor('emacs').command).toBe('emacsclient');
  });

  it('treats an unknown name as a VS Code style binary', () => {
    expect(resolveEditor('my-fork')).toStrictEqual({
      command: 'my-fork',
      args: ['--goto', '{file}:{line}:{column}'],
    });
  });

  it('passes a custom command through untouched', () => {
    const editor = { command: 'nvr', args: ['+{line}', '{file}'] };

    expect(resolveEditor(editor)).toBe(editor);
  });
});

describe('buildEditorArgs', () => {
  it('substitutes every placeholder', () => {
    expect(buildEditorArgs(resolveEditor('code'), location)).toStrictEqual([
      '--goto',
      '/project/src/App.tsx:12:3',
    ]);
  });

  it('substitutes placeholders in custom argument lists', () => {
    expect(
      buildEditorArgs({ command: 'nvr', args: ['+{line}', '{file}'] }, location),
    ).toStrictEqual(['+12', '/project/src/App.tsx']);
  });

  it('falls back to the goto form when a custom command omits args', () => {
    expect(buildEditorArgs({ command: 'code' }, location)).toStrictEqual([
      '--goto',
      '/project/src/App.tsx:12:3',
    ]);
  });
});

describe('buildSpawnPlan', () => {
  const windowsFile = String.raw`C:\Users\Ada\app\src\App.tsx`;
  const spacedFile = String.raw`C:\Users\Ada Lovelace\my app\src\App.tsx`;

  it('spawns the editor directly off Windows', () => {
    expect(buildSpawnPlan(resolveEditor('code'), location, 'darwin')).toStrictEqual({
      command: 'code',
      args: ['--goto', '/project/src/App.tsx:12:3'],
      windowsVerbatimArguments: false,
    });
  });

  it('routes through cmd.exe on Windows so the .cmd shim resolves', () => {
    const plan = buildSpawnPlan(
      resolveEditor('code'),
      { file: windowsFile, line: 12, column: 3 },
      'win32',
    );

    expect(plan.windowsVerbatimArguments).toBe(true);
    expect(plan.args.slice(0, 3)).toStrictEqual(['/d', '/s', '/c']);
    expect(plan.args[3]).toBe(`"code --goto ${windowsFile}:12:3"`);
  });

  it('quotes a path containing spaces, which would otherwise split in two', () => {
    const plan = buildSpawnPlan(
      resolveEditor('code'),
      { file: spacedFile, line: 12, column: 3 },
      'win32',
    );

    expect(plan.args[3]).toBe(`"code --goto "${spacedFile}:12:3""`);
  });

  it('quotes a command whose own path contains spaces', () => {
    const plan = buildSpawnPlan(
      { command: String.raw`C:\Program Files\Microsoft VS Code\bin\code.cmd` },
      { file: windowsFile, line: 12, column: 3 },
      'win32',
    );

    expect(plan.args[3]).toBe(
      `""C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd" --goto ${windowsFile}:12:3"`,
    );
  });
});
