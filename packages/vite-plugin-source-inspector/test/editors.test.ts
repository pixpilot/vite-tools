import { describe, expect, it } from 'vitest';
import { buildEditorArgs, resolveEditor } from '../src/editors.ts';

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
