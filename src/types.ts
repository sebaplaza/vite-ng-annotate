import type { Node } from "acorn";

/**
 * Plugin configuration options for vite-ng-annotate.
 */
export interface NgAnnotateOptions {
  /**
   * When true, only annotate functions explicitly marked with
   * `@ngInject` comment or `"ngInject"` directive prologue.
   * When false (default), implicitly detects common AngularJS patterns.
   * @default false
   */
  explicitOnly?: boolean;

  /**
   * File extensions to process.
   * @default [".js", ".ts", ".mjs", ".cjs"]
   */
  include?: string[];

  /**
   * File extensions to exclude from processing.
   * @default [".spec.js", ".spec.ts", ".test.js", ".test.ts"]
   */
  exclude?: string[];
}

/**
 * Describes a single annotation that needs to be applied to the source code.
 * Each annotation targets a function and specifies how to annotate it.
 */
export interface AnnotationTarget {
  /**
   * The function/arrow/class node to annotate.
   */
  node: AcornNode;

  /**
   * Parameter names extracted from the function signature.
   */
  params: string[];

  /**
   * The annotation strategy to use:
   * - "inline-array": Wraps the function in `["dep1", "dep2", fn]`
   * - "$inject": Adds `Name.$inject = ["dep1", "dep2"]` after the declaration
   */
  type: "inline-array" | "$inject";

  /**
   * For "$inject" annotations, the name to attach `$inject` to.
   */
  name?: string;

  /**
   * For "$inject" annotations, the node after which to insert the `$inject` statement.
   */
  insertAfterNode?: AcornNode;

  /**
   * Whether the node is an ES6 shorthand method that needs to be
   * converted to a regular `key: function(...) {}` property.
   */
  isShorthandMethod?: boolean;

  /**
   * For shorthand methods, the full Property node that needs rewriting.
   */
  propertyNode?: AcornNode;
}

/**
 * Acorn AST node extended with start/end positions and optional fields
 * used across different ESTree node types.
 */
export interface AcornNode extends Node {
  /** Index signature for dynamic AST property access. */
  [key: string]: unknown;
  /** Node type discriminator (e.g., "FunctionExpression", "CallExpression"). */
  type: string;

  /** Child body for block statements, programs, or function bodies. */
  body?: AcornNode | AcornNode[];

  /** Function/arrow parameters. */
  params?: AcornNode[];

  /** Variable declarations within a VariableDeclaration. */
  declarations?: AcornNode[];

  /** Expression in an ExpressionStatement. */
  expression?: AcornNode;

  /** Callee of a CallExpression. */
  callee?: AcornNode;

  /** Arguments of a CallExpression. */
  arguments?: AcornNode[];

  /** Object of a MemberExpression. */
  object?: AcornNode;

  /** Property of a MemberExpression. */
  property?: AcornNode;

  /** Identifier name. */
  name?: string;

  /** Literal value. */
  value?: unknown;

  /** Raw string of a literal. */
  raw?: string;

  /** Init expression in a VariableDeclarator. */
  init?: AcornNode;

  /** Declarator ID (pattern). */
  id?: AcornNode;

  /** Properties of an ObjectExpression. */
  properties?: AcornNode[];

  /** Key of a Property node. */
  key?: AcornNode;

  /** Whether a Property uses shorthand method syntax. */
  method?: boolean;

  /** Whether a Property uses shorthand value syntax. */
  shorthand?: boolean;

  /** Whether a MemberExpression is computed. */
  computed?: boolean;

  /** Elements of an ArrayExpression. */
  elements?: AcornNode[];

  /** Class body node. */
  kind?: string;

  /** Return argument of a ReturnStatement. */
  argument?: AcornNode;

  /** Left/right of an AssignmentExpression or BinaryExpression. */
  left?: AcornNode;
  right?: AcornNode;

  /** Consequent/alternate of an IfStatement or ConditionalExpression. */
  consequent?: AcornNode;
  alternate?: AcornNode;

  /** Declaration in ExportDefaultDeclaration or ExportNamedDeclaration. */
  declaration?: AcornNode;

  /** Superclass of a ClassDeclaration/ClassExpression. */
  superClass?: AcornNode;

  /** Leading comments attached to the node. */
  leadingComments?: AcornComment[];
}

/**
 * Represents a comment collected during parsing.
 */
export interface AcornComment {
  /** Comment type: "Line" for `//`, "Block" for block comments. */
  type: "Line" | "Block";

  /** The comment text without delimiters. */
  value: string;

  /** Start offset in the source. */
  start: number;

  /** End offset in the source. */
  end: number;
}
