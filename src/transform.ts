import MagicString from "magic-string";
import type { AcornNode, AnnotationTarget } from "./types.ts";

/**
 * Apply all collected annotation targets to the source code.
 * Uses MagicString for efficient, position-based string manipulation
 * that preserves sourcemap accuracy.
 *
 * @param code - The original source code string.
 * @param targets - Array of annotation targets from the visitor.
 * @returns The transformed source code with annotations applied, or null if no changes.
 */
export function applyAnnotations(code: string, targets: AnnotationTarget[]): string | null {
  if (targets.length === 0) return null;

  const s = new MagicString(code);

  /*
   * Sort targets by position (descending) so that earlier modifications
   * don't shift the positions of later ones. MagicString handles this
   * internally, but sorting helps with deterministic output.
   */
  const sorted = [...targets].sort((a, b) => b.node.start - a.node.start);

  for (const target of sorted) {
    if (target.type === "inline-array") {
      applyInlineArray(s, code, target);
    } else if (target.type === "$inject") {
      applyInjectProperty(s, target);
    }
  }

  return s.toString();
}

/**
 * Apply an inline-array annotation to a function.
 * Transforms `function($scope, $timeout) {}` into
 * `["$scope", "$timeout", function($scope, $timeout) {}]`.
 *
 * For shorthand methods like `{ controller($scope) {} }`, converts to
 * `{ controller: ["$scope", function($scope) {}] }`.
 *
 * @param s - The MagicString instance for source manipulation.
 * @param code - The original source code (needed for shorthand method rewriting).
 * @param target - The annotation target describing the transformation.
 */
function applyInlineArray(s: MagicString, code: string, target: AnnotationTarget): void {
  const { node, params, isShorthandMethod, propertyNode } = target;
  const arrayPrefix = buildArrayPrefix(params);

  if (isShorthandMethod && propertyNode) {
    /*
     * Shorthand method: `{ controller($scope) {} }`
     * Must rewrite to: `{ controller: ["$scope", function($scope) {}] }`
     *
     * We extract the key name, params, and body from the original source
     * and rebuild as a standard property with inline array annotation.
     */
    const keyNode = propertyNode.key!;
    /* v8 ignore next - shorthand method keys are always identifiers */
    const keyName = keyNode.type === "Identifier" ? keyNode.name : String(keyNode.value);

    const bodyNode = node.body as AcornNode;
    const fnBody = code.slice(bodyNode.start, bodyNode.end);
    const fnSource = code.slice(node.start, node.end);
    /* Find the params portion: everything from first "(" to matching ")". */
    const parenStart = fnSource.indexOf("(");
    const parenEnd = fnSource.indexOf(")");
    const fnParams = fnSource.slice(parenStart, parenEnd + 1);

    const replacement = `${keyName}: ${arrayPrefix}function${fnParams} ${fnBody}]`;
    s.overwrite(propertyNode.start, propertyNode.end, replacement);
  } else {
    /* Standard inline array: wrap the function in ["dep1", "dep2", fn]. */
    s.appendLeft(node.start, arrayPrefix);
    s.appendRight(node.end, "]");
  }
}

/**
 * Apply a $inject property annotation after a declaration.
 * Inserts `Name.$inject = ["dep1", "dep2"];` on a new line
 * after the declaration statement.
 *
 * @param s - The MagicString instance for source manipulation.
 * @param target - The annotation target describing the transformation.
 */
function applyInjectProperty(s: MagicString, target: AnnotationTarget): void {
  const { params, name, insertAfterNode } = target;
  /* v8 ignore next - $inject targets always have name and insertAfterNode */
  if (!name || !insertAfterNode) return;

  const deps = params.map((p) => `"${p}"`).join(", ");
  const inject = `\n${name}.$inject = [${deps}];`;

  s.appendRight(insertAfterNode.end, inject);
}

/**
 * Build the array prefix string for inline-array annotations.
 * For params `["$scope", "$timeout"]`, produces `["$scope", "$timeout", `.
 *
 * @param params - Array of parameter name strings.
 * @returns The formatted array prefix string.
 */
function buildArrayPrefix(params: string[]): string {
  const deps = params.map((p) => `"${p}"`).join(", ");
  return `[${deps}, `;
}
