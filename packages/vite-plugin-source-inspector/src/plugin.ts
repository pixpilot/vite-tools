import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { ResolvedOptions } from './options.ts';
import type { SourceInspectorOptions } from './types.ts';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildSpawnPlan } from './editors.ts';
import { instrument } from './instrument.ts';
import { matchesFilter, resolveOptions } from './options.ts';

const defaultVitePort = 5173;
const shellUnsafePattern = /["$&'();<>`|]/u;

/** Source layout first, then the layout of a bundled `dist`. */
const clientCandidates = ['./client/runtime.ts', './client/runtime.js', './runtime.js'];

function toPosix(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/** Ids arrive with Vite's `?import`/`?t=` suffixes attached. */
function stripQuery(id: string): string {
  return id.split('?', 1)[0] ?? '';
}

function isClientRequest(options: ResolvedOptions | undefined, id: string): boolean {
  return options !== undefined && stripQuery(id) === options.clientUrl;
}

/** Returns the root-relative posix path, or `null` when the file sits outside the root. */
function toRootRelative(root: string, filePath: string): string | null {
  const relativePath = relative(root, filePath);
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath))
    return null;
  return relativePath.split(sep).join('/');
}

function readClientSource(): { code: string; isTypeScript: boolean } {
  for (const candidate of clientCandidates) {
    const path = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(path)) {
      return { code: readFileSync(path, 'utf8'), isTypeScript: path.endsWith('.ts') };
    }
  }

  throw new Error(
    '[source-inspector] could not locate the browser runtime next to the plugin',
  );
}

/** Compiles the runtime and appends the bootstrap call carrying the resolved options. */
function buildClientBundle(options: ResolvedOptions): string {
  const source = readClientSource();
  const code = source.isTypeScript
    ? ts.transpileModule(source.code, {
        fileName: 'runtime.ts',
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText
    : source.code;

  return `${code}\ncreateInspector(${JSON.stringify(options.client)});\n`;
}

function allowCors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export function sourceInspectorPlugin(userOptions: SourceInspectorOptions = {}): Plugin {
  let root = process.cwd();
  let options: ResolvedOptions | undefined;

  const log = (message: string, detail?: unknown) => {
    if (options?.verbose !== true) return;
    console.warn(`[source-inspector] ${message}`, detail ?? '');
  };

  const openInEditor = (request: IncomingMessage, response: ServerResponse) => {
    if (options === undefined) return;

    const url = new URL(request.url ?? '', options.origin);
    const file = url.searchParams.get('file');
    const line = Number(url.searchParams.get('line'));
    const column = Number(url.searchParams.get('column'));
    const resolvedFile = file === null ? '' : resolve(root, file);

    if (
      file === null ||
      toRootRelative(root, resolvedFile) === null ||
      !Number.isInteger(line) ||
      !Number.isInteger(column)
    ) {
      console.warn('[source-inspector] rejected editor request', { file, line, column });
      response.statusCode = 400;
      response.end();
      return;
    }

    // `.cmd` shims on Windows are only spawnable through a shell, which means the
    // arguments are re-parsed — refuse anything that could break out of them.
    const useShell = process.platform === 'win32';
    if (useShell && shellUnsafePattern.test(resolvedFile)) {
      console.warn(
        '[source-inspector] refusing to open a path with shell metacharacters',
        file,
      );
      response.statusCode = 400;
      response.end();
      return;
    }

    const plan = buildSpawnPlan(
      options.editor,
      { file: resolvedFile, line, column },
      process.platform,
    );
    log('opening editor', [plan.command, ...plan.args].join(' '));

    const child = spawn(plan.command, plan.args, {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: plan.windowsVerbatimArguments,
    });
    child.on('error', (error) => {
      console.error(
        `[source-inspector] failed to launch "${options?.editor.command}"`,
        error,
      );
    });
    child.unref();

    allowCors(response);
    response.statusCode = 204;
    response.end();
  };

  return {
    name: 'source-inspector',
    // `@vitejs/plugin-react` and friends compile JSX away in a `pre` transform, so the
    // instrumentation has to run before them to still see any JSX.
    enforce: 'pre',
    apply: (_config, env) => userOptions.enabled ?? env.command === 'serve',

    configResolved(config) {
      root = config.root;
      options = resolveOptions(userOptions, {
        root: config.root,
        port: config.server.port ?? defaultVitePort,
      });
      log('enabled', { root, origin: options.origin, editor: options.editor });
    },

    // The client is a module like any other rather than a middleware response, so Vite
    // can resolve the injected <script src> when it pre-transforms the HTML.
    resolveId(id) {
      return isClientRequest(options, id) ? options?.clientUrl : null;
    },

    load(id) {
      if (options === undefined || !isClientRequest(options, id)) return null;
      // Rebuilt per request so edits to the runtime show up on the next page load
      // instead of needing a dev-server restart.
      return buildClientBundle(options);
    },

    configureServer(server) {
      const resolved = options;
      if (resolved === undefined) return;

      server.middlewares.use(`${resolved.endpoint}/open`, (request, response, next) => {
        if (request.method === 'OPTIONS') {
          allowCors(response);
          response.statusCode = 204;
          response.end();
          return;
        }

        if (request.method !== 'POST') {
          next();
          return;
        }

        openInEditor(request, response);
      });
    },

    // Runs before Vite's own HTML pipeline so the tag is resolved like an authored one.
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (options === undefined || !options.injectClient(toPosix(context.filename))) {
          return html;
        }

        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module', src: options.clientUrl },
              injectTo: 'body',
            },
          ],
        };
      },
    },

    transform(code, id) {
      if (options === undefined) return null;

      const filePath = toPosix(stripQuery(id));
      if (!options.extensions.some((extension) => filePath.endsWith(extension)))
        return null;

      const relativePath = toRootRelative(root, filePath);
      if (relativePath === null) return null;
      if (
        !matchesFilter(relativePath, options.include) ||
        matchesFilter(relativePath, options.exclude)
      ) {
        return null;
      }

      const instrumented = instrument(code, {
        filePath,
        relativePath,
        attribute: options.attribute,
      });
      if (instrumented === null) return null;

      log('instrumented', relativePath);
      return { code: instrumented, map: null };
    },
  };
}
