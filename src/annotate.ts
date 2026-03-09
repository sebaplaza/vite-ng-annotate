import { attachComments, parseSource } from "./parser.ts";
import { applyAnnotations } from "./transform.ts";
import type { NgAnnotateOptions } from "./types.ts";
import { collectAnnotations } from "./visitor.ts";

/**
 * Annotate AngularJS dependency injection in the given source code.
 * This is the main entry point for the annotation engine.
 *
 * Parses the code into an AST, detects AngularJS DI patterns (both
 * implicit and explicit), and returns the transformed source with
 * proper annotations that survive minification.
 *
 * @param code - The JavaScript source code to annotate.
 * @param options - Plugin configuration options.
 * @returns The annotated source code, or null if no annotations were needed.
 *
 * @example
 * ```ts
 * const result = annotate(
 *   'myMod.controller("MyCtrl", function($scope) {});',
 *   {}
 * );
 * // result: 'myMod.controller("MyCtrl", ["$scope", function($scope) {}]);'
 * ```
 */
export function annotate(code: string, options: NgAnnotateOptions = {}): string | null {
  const { ast, comments } = parseSource(code);
  attachComments(ast, comments, code);

  const targets = collectAnnotations(ast, options);
  return applyAnnotations(code, targets);
}
