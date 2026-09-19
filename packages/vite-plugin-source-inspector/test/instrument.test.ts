import { describe, expect, it } from 'vitest';
import { instrument } from '../src/instrument.ts';

const attribute = 'data-source-inspector-file';

function run(code: string): string | null {
  return instrument(code, {
    filePath: '/project/src/App.tsx',
    relativePath: 'src/App.tsx',
    attribute,
  });
}

function attributesOf(code: string): string[] {
  return [...code.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'gu'))].map(
    (match) => match[1] ?? '',
  );
}

describe('instrument', () => {
  it('returns null when the file contains no JSX', () => {
    expect(run('export const answer = 42;')).toBeNull();
  });

  it('tags an element with its one-based line and column', () => {
    const code = ['export function App() {', '  return <div>hi</div>;', '}'].join('\n');

    expect(attributesOf(run(code) ?? '')).toStrictEqual(['src/App.tsx:2:10']);
  });

  it('tags self-closing elements and components alike', () => {
    const code = 'export const App = () => <Panel><br /></Panel>;';

    expect(attributesOf(run(code) ?? '')).toStrictEqual([
      'src/App.tsx:1:26',
      'src/App.tsx:1:33',
    ]);
  });

  it('tags JSX nested inside attribute expressions', () => {
    const code = 'export const App = () => <Tabs icon={<Icon />} />;';

    expect(attributesOf(run(code) ?? '')).toContain('src/App.tsx:1:38');
  });

  it('leaves fragments alone but still walks their children', () => {
    const code = 'export const App = () => <><span>a</span></>;';
    const output = run(code) ?? '';

    expect(attributesOf(output)).toStrictEqual(['src/App.tsx:1:28']);
    expect(output).toContain('<>');
  });

  it('does not add a second attribute when one is already present', () => {
    const code = `export const App = () => <div ${attribute}="kept:1:1" />;`;

    expect(attributesOf(run(code) ?? '')).toStrictEqual(['kept:1:1']);
  });

  it('keeps type annotations so the downstream JSX compiler can still parse them', () => {
    const code = 'export const App = (props: { id: string }) => <div>{props.id}</div>;';

    expect(run(code)).toContain('props: {');
  });

  it('uses a custom attribute name', () => {
    const output = instrument('export const App = () => <div />;', {
      filePath: '/project/src/App.tsx',
      relativePath: 'src/App.tsx',
      attribute: 'data-loc',
    });

    expect(output).toContain('data-loc="src/App.tsx:1:26"');
  });
});
