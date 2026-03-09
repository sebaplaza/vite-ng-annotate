import type { Plugin } from "vite";
import { annotate } from "./annotate.ts";
import type { NgAnnotateOptions } from "./types.ts";

/**
 * Default file extensions to process for AngularJS DI annotation.
 */
const DEFAULT_INCLUDE = [".js", ".ts", ".mjs", ".cjs"];

/**
 * Default file extensions to exclude from annotation processing.
 */
const DEFAULT_EXCLUDE = [".spec.js", ".spec.ts", ".test.js", ".test.ts"];

/**
 * Create a Vite plugin that automatically adds AngularJS dependency
 * injection annotations to your source code during the build.
 *
 * This plugin detects common AngularJS patterns (module methods, providers,
 * route configs, UI-Router states, modals, etc.) and wraps injectable
 * functions with array-style annotations or adds `$inject` properties
 * so that the code survives minification.
 *
 * @param options - Plugin configuration options.
 * @returns A Vite plugin instance.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import ngAnnotate from "vite-ng-annotate";
 *
 * export default defineConfig({
 *   plugins: [ngAnnotate()],
 * });
 * ```
 *
 * @example
 * ```ts
 * // Explicit-only mode (requires @ngInject markers)
 * export default defineConfig({
 *   plugins: [ngAnnotate({ explicitOnly: true })],
 * });
 * ```
 */
export default function ngAnnotatePlugin(options: NgAnnotateOptions = {}): Plugin {
  const include = options.include || DEFAULT_INCLUDE;
  const exclude = options.exclude || DEFAULT_EXCLUDE;

  return {
    name: "vite-ng-annotate",
    enforce: "pre",

    /**
     * Transform hook: processes each module's source code to add
     * AngularJS DI annotations before other plugins see it.
     *
     * @param code - The module's source code.
     * @param id - The module's file path / identifier.
     * @returns Transformed code with annotations, or undefined if skipped.
     */
    transform(code: string, id: string) {
      /* Skip files that don't match inclusion criteria. */
      if (!shouldProcess(id, include, exclude)) {
        return undefined;
      }

      /* Skip files that don't look like they contain AngularJS code. */
      if (!mightContainAngular(code)) {
        return undefined;
      }

      const result = annotate(code, options);
      if (result === null) {
        return undefined;
      }

      return {
        code: result,
        map: null,
      };
    },
  };
}

/**
 * Check if a file should be processed based on include/exclude patterns.
 * Matches against file extension suffixes.
 *
 * @param id - The file path to check.
 * @param include - Array of extensions to include.
 * @param exclude - Array of extensions to exclude.
 * @returns True if the file should be processed.
 */
function shouldProcess(id: string, include: string[], exclude: string[]): boolean {
  /* Exclude takes priority. */
  for (const ext of exclude) {
    if (id.endsWith(ext)) return false;
  }
  for (const ext of include) {
    if (id.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Quick heuristic check to skip files that clearly don't contain AngularJS code.
 * Avoids the cost of full AST parsing on irrelevant files.
 *
 * @param code - The source code to check.
 * @returns True if the code might contain AngularJS patterns.
 */
function mightContainAngular(code: string): boolean {
  return (
    code.includes("angular") ||
    code.includes("ngInject") ||
    code.includes("$inject") ||
    code.includes(".controller") ||
    code.includes(".service") ||
    code.includes(".factory") ||
    code.includes(".directive") ||
    code.includes(".filter") ||
    code.includes(".config") ||
    code.includes(".run(") ||
    code.includes(".provider") ||
    code.includes(".component") ||
    code.includes(".decorator") ||
    code.includes("$stateProvider") ||
    code.includes("$routeProvider") ||
    code.includes("$modal") ||
    code.includes("$uibModal") ||
    code.includes("$mdDialog")
  );
}

/* Re-export the annotate function and types for programmatic use. */
export { annotate } from "./annotate.ts";
export type { AnnotationTarget, NgAnnotateOptions } from "./types.ts";
