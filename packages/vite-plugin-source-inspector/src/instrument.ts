import ts from 'typescript';

export interface InstrumentOptions {
  /** Path used for diagnostics and to pick the TSX/JSX parser. */
  filePath: string;
  /** Value written into the attribute, prefixed to `:line:column`. */
  relativePath: string;
  /** Attribute name to add to every JSX element. */
  attribute: string;
}

function hasAttribute(attributes: ts.JsxAttributes, name: string): boolean {
  return attributes.properties.some(
    (property) =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name,
  );
}

/**
 * Tags every JSX element with `attribute="<relativePath>:<line>:<column>"` so the browser
 * client can map a DOM node back to the source that produced it.
 *
 * Returns `null` when the file contains no JSX and therefore needs no rewrite.
 */
export function instrument(code: string, options: InstrumentOptions): string | null {
  const sourceFile = ts.createSourceFile(
    options.filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let hasJsx = false;

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const addSourceAttribute = (attributes: ts.JsxAttributes, position: number) => {
      if (hasAttribute(attributes, options.attribute)) return attributes;

      const location = sourceFile.getLineAndCharacterOfPosition(position);
      const value = `${options.relativePath}:${location.line + 1}:${location.character + 1}`;

      return ts.factory.updateJsxAttributes(attributes, [
        ...attributes.properties,
        ts.factory.createJsxAttribute(
          // A raw string here yields a node of kind `Unknown` and crashes the printer.
          ts.factory.createIdentifier(options.attribute),
          ts.factory.createStringLiteral(value),
        ),
      ]);
    };

    const visit: ts.Visitor = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        hasJsx = true;
        const position = node.getStart(sourceFile);
        // Visit first so JSX nested in attribute expressions is instrumented too.
        const visited = ts.visitEachChild(node, visit, context);
        const attributes = addSourceAttribute(visited.attributes, position);

        return ts.isJsxOpeningElement(visited)
          ? ts.factory.updateJsxOpeningElement(
              visited,
              visited.tagName,
              visited.typeArguments,
              attributes,
            )
          : ts.factory.updateJsxSelfClosingElement(
              visited,
              visited.tagName,
              visited.typeArguments,
              attributes,
            );
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformed = result.transformed[0];

  try {
    if (!hasJsx || transformed === undefined) return null;
    return ts.createPrinter().printFile(transformed);
  } finally {
    result.dispose();
  }
}
