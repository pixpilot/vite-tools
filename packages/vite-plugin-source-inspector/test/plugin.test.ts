import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ResolvedConfig } from 'vite';
import type { SourceInspectorOptions } from '../src/types.ts';
import { describe, expect, it } from 'vitest';
import { sourceInspectorPlugin } from '../src/plugin.ts';

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

const root = '/project';
const badRequest = 400;
const noContent = 204;

function createPlugin(options: SourceInspectorOptions = {}) {
  const plugin = sourceInspectorPlugin(options);
  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;

  configResolved({ root, server: { port: 4000 } } as unknown as ResolvedConfig);

  const transform = plugin.transform as unknown as (
    code: string,
    id: string,
  ) => { code: string } | null;

  const transformIndexHtml = plugin.transformIndexHtml as unknown as {
    handler: (
      html: string,
      context: { filename: string },
    ) => string | { tags: { attrs?: Record<string, unknown> }[] };
  };

  const resolveId = plugin.resolveId as unknown as (id: string) => string | null;
  const load = plugin.load as unknown as (id: string) => string | null;

  const routes = new Map<string, Middleware>();
  const configureServer = plugin.configureServer as unknown as (server: unknown) => void;
  configureServer({
    middlewares: {
      use: (route: string, handler: Middleware) => {
        routes.set(route, handler);
      },
    },
  });

  return { plugin, transform, transformIndexHtml, resolveId, load, routes };
}

function createResponse() {
  const headers = new Map<string, string>();
  const state = { body: '', statusCode: 200 };

  const response = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    end(chunk?: string) {
      state.body = chunk ?? '';
    },
  };

  return { response: response as unknown as ServerResponse, headers, state };
}

const component = 'export const App = () => <div>hi</div>;';

describe('sourceInspectorPlugin', () => {
  it('runs before the JSX compilers that would erase the JSX', () => {
    expect(sourceInspectorPlugin().enforce).toBe('pre');
  });

  it('only applies to the dev server unless forced on', () => {
    const apply = sourceInspectorPlugin().apply as (
      config: unknown,
      env: unknown,
    ) => boolean;

    expect(apply({}, { command: 'serve' })).toBe(true);
    expect(apply({}, { command: 'build' })).toBe(false);
    expect(
      (sourceInspectorPlugin({ enabled: true }).apply as typeof apply)(
        {},
        { command: 'build' },
      ),
    ).toBe(true);
  });

  describe('transform', () => {
    it('instruments files inside the included directories', () => {
      const { transform } = createPlugin({ include: ['src/ui'] });
      const result = transform(component, `${root}/src/ui/App.tsx`);

      expect(result?.code).toContain('data-source-inspector-file="src/ui/App.tsx:1:26"');
    });

    it('skips files outside the included directories', () => {
      const { transform } = createPlugin({ include: ['src/ui'] });

      expect(transform(component, `${root}/src/background/App.tsx`)).toBeNull();
    });

    it('skips excluded files', () => {
      const { transform } = createPlugin({ include: ['src'], exclude: [/\.stories\./u] });

      expect(transform(component, `${root}/src/App.stories.tsx`)).toBeNull();
    });

    it('skips extensions it was not asked to handle', () => {
      const { transform } = createPlugin();

      expect(transform(component, `${root}/src/App.ts`)).toBeNull();
    });

    it('ignores the vite query suffix on ids', () => {
      const { transform } = createPlugin();

      expect(transform(component, `${root}/src/App.tsx?t=1234`)).not.toBeNull();
    });

    it('skips files outside the vite root', () => {
      const { transform } = createPlugin();

      expect(transform(component, '/elsewhere/src/App.tsx')).toBeNull();
    });
  });

  describe('transformIndexHtml', () => {
    it('injects the client script', () => {
      const { transformIndexHtml } = createPlugin();
      const result = transformIndexHtml.handler('<html></html>', {
        filename: `${root}/views/popup.html`,
      });

      expect(typeof result === 'string' ? [] : result.tags).toStrictEqual([
        {
          tag: 'script',
          attrs: { type: 'module', src: '/__source-inspector/client.js' },
          injectTo: 'body',
        },
      ]);
    });

    it('leaves pages the filter rejects untouched', () => {
      const { transformIndexHtml } = createPlugin({ injectClient: /sidepanel/u });

      expect(
        transformIndexHtml.handler('<html></html>', {
          filename: `${root}/views/popup.html`,
        }),
      ).toBe('<html></html>');
    });
  });

  describe('client module', () => {
    it('claims its own url so vite can pre-transform the injected script tag', () => {
      const { resolveId } = createPlugin();

      expect(resolveId('/__source-inspector/client.js')).toBe(
        '/__source-inspector/client.js',
      );
      expect(resolveId('/__source-inspector/client.js?import&t=1')).toBe(
        '/__source-inspector/client.js',
      );
      expect(resolveId('/src/main.tsx')).toBeNull();
    });

    it('serves a self-contained module that boots itself with the resolved options', () => {
      const { load } = createPlugin({
        attribute: 'data-loc',
        toggleButton: { label: 'Locate' },
      });
      const code = load('/__source-inspector/client.js') ?? '';

      expect(code).toContain('function createInspector(');
      expect(code).toContain('"attribute":"data-loc"');
      expect(code).toContain('"label":"Locate"');
      // Nothing may be imported at runtime: the file is served on its own.
      expect(code).not.toMatch(/^\s*import\s/mu);
      // And it must be plain JavaScript by the time it reaches the browser.
      expect(code).not.toContain(': ClientOptions');
    });

    it('loads nothing for other ids', () => {
      const { load } = createPlugin();

      expect(load('/src/main.tsx')).toBeNull();
    });
  });

  describe('open route', () => {
    it('rejects a file that escapes the vite root', () => {
      const { routes } = createPlugin();
      const { response, state } = createResponse();

      routes.get('/__source-inspector/open')?.(
        {
          method: 'POST',
          url: '/?file=..%2F..%2Fsecrets.txt&line=1&column=1',
        } as IncomingMessage,
        response,
        () => undefined,
      );

      expect(state.statusCode).toBe(badRequest);
    });

    it('rejects a non-numeric line', () => {
      const { routes } = createPlugin();
      const { response, state } = createResponse();

      routes.get('/__source-inspector/open')?.(
        {
          method: 'POST',
          url: '/?file=src/App.tsx&line=nope&column=1',
        } as IncomingMessage,
        response,
        () => undefined,
      );

      expect(state.statusCode).toBe(badRequest);
    });

    it('answers preflight requests', () => {
      const { routes } = createPlugin();
      const { response, headers, state } = createResponse();

      routes.get('/__source-inspector/open')?.(
        { method: 'OPTIONS', url: '/' } as IncomingMessage,
        response,
        () => undefined,
      );

      expect(state.statusCode).toBe(noContent);
      expect(headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('passes anything that is not a POST down the middleware chain', () => {
      const { routes } = createPlugin();
      const { response } = createResponse();
      let nextCalled = false;

      routes.get('/__source-inspector/open')?.(
        { method: 'GET', url: '/' } as IncomingMessage,
        response,
        () => {
          nextCalled = true;
        },
      );

      expect(nextCalled).toBe(true);
    });
  });
});
