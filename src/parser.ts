import * as acorn from "acorn";
import type { AcornComment, AcornNode } from "./types.ts";

/**
 * Parse JavaScript/TypeScript source code into an ESTree-compatible AST.
 * Collects comments separately and attaches them to adjacent nodes
 * so that `@ngInject` / `@ngNoInject` markers can be detected.
 *
 * @param code - The source code string to parse.
 * @returns An object containing the AST root and the collected comments.
 */
export function parseSource(code: string): {
  ast: AcornNode;
  comments: AcornComment[];
} {
  const comments: AcornComment[] = [];

  const ast = acorn.parse(code, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    ranges: true,
    onComment: (block, text, start, end) => {
      comments.push({
        type: block ? "Block" : "Line",
        value: text,
        start,
        end,
      });
    },
  }) as unknown as AcornNode;

  return { ast, comments };
}

/**
 * Attach leading comments to AST nodes based on position proximity.
 * A comment is "leading" if it appears immediately before a node
 * (allowing only whitespace between them).
 *
 * @param ast - The root AST node (Program).
 * @param comments - All comments collected during parsing.
 * @param code - The original source code (used to check whitespace gaps).
 */
export function attachComments(ast: AcornNode, comments: AcornComment[], code: string): void {
  if (comments.length === 0) return;

  const nodes = collectAllNodes(ast);

  for (const comment of comments) {
    /* Find the first node that starts after this comment. */
    const textBetween = code.slice(comment.end, code.length);
    const match = textBetween.match(/^\s*/);
    /* v8 ignore next - the whitespace regex always matches */
    const gapLength = match ? match[0].length : 0;
    const targetStart = comment.end + gapLength;

    /* Locate the node closest to (and at or after) targetStart. */
    let closest: AcornNode | null = null;
    let closestDist = Infinity;
    for (const node of nodes) {
      const dist = node.start - targetStart;
      if (dist >= 0 && dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    if (closest) {
      if (!closest.leadingComments) {
        closest.leadingComments = [];
      }
      closest.leadingComments.push(comment);
    }
  }
}

/**
 * Recursively collect every node in the AST into a flat array,
 * sorted by start position. Used for efficient comment attachment.
 *
 * @param node - The root node to start collecting from.
 * @returns A flat array of all AST nodes sorted by position.
 */
function collectAllNodes(node: AcornNode): AcornNode[] {
  const result: AcornNode[] = [];

  function walk(n: AcornNode): void {
    result.push(n);
    for (const key of Object.keys(n)) {
      if (key === "leadingComments") continue;
      const child = (n as Record<string, unknown>)[key];
      if (child && typeof child === "object" && "type" in (child as AcornNode)) {
        walk(child as AcornNode);
      } else if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            walk(item as AcornNode);
          }
        }
      }
    }
  }

  walk(node);
  result.sort((a, b) => a.start - b.start);
  return result;
}
