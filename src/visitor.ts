import type { AcornNode, AnnotationTarget, NgAnnotateOptions } from "./types.ts";

/**
 * Set of AngularJS module methods whose second argument is an injectable function.
 * These follow the pattern: `module.<method>(name, fn)`.
 */
const MODULE_METHODS_WITH_NAME = new Set([
  "controller",
  "service",
  "factory",
  "filter",
  "directive",
  "animation",
  "invoke",
  "store",
  "decorator",
]);

/**
 * Set of AngularJS module methods whose first argument is an injectable function.
 * These follow the pattern: `module.<method>(fn)`.
 */
const MODULE_METHODS_NO_NAME = new Set(["config", "run"]);

/**
 * Set of property names inside `.component()` config objects
 * that should be annotated.
 */
const COMPONENT_INJECTABLE_PROPS = new Set(["controller", "template", "templateUrl"]);

/**
 * Set of property names inside route/state config objects
 * that should be annotated directly.
 */
const ROUTE_INJECTABLE_PROPS = new Set([
  "controller",
  "controllerProvider",
  "templateProvider",
  "onEnter",
  "onExit",
]);

/**
 * Set of property names inside route/state config objects
 * whose values are objects with all-injectable function values.
 */
const ROUTE_RESOLVE_PROPS = new Set(["resolve"]);

/**
 * Set of dialog/modal service method callers.
 */
const DIALOG_SERVICES = new Set(["$modal", "$uibModal", "$mdDialog", "$mdToast", "$mdBottomSheet"]);

/**
 * Visit the entire AST and collect all functions that need DI annotation.
 * Handles both implicit pattern detection and explicit `@ngInject` markers.
 *
 * @param ast - The root AST node (Program).
 * @param options - Plugin configuration.
 * @returns An array of annotation targets to apply.
 */
export function collectAnnotations(ast: AcornNode, options: NgAnnotateOptions): AnnotationTarget[] {
  const targets: AnnotationTarget[] = [];
  /** Track nodes already annotated to avoid duplicates. */
  const annotated = new Set<AcornNode>();
  /** Track nodes explicitly suppressed via @ngNoInject. */
  const suppressed = new Set<AcornNode>();
  /**
   * Map of variable/function names to their declaration info,
   * used for reference-following.
   */
  const declarations = new Map<string, { node: AcornNode; declarationNode: AcornNode }>();

  /**
   * Add an inline-array annotation target for the given function node.
   * Skips if the function has no parameters or is already annotated/suppressed.
   *
   * @param fnNode - The function/arrow node to annotate.
   * @param isShorthand - Whether this is an ES6 shorthand method.
   * @param propNode - The Property node if this is an object property.
   */
  function addInlineArray(fnNode: AcornNode, isShorthand = false, propNode?: AcornNode): void {
    if (annotated.has(fnNode) || suppressed.has(fnNode)) return;
    if (hasNgNoInject(fnNode)) return;
    const params = extractParams(fnNode);
    if (params.length === 0) return;
    annotated.add(fnNode);
    targets.push({
      node: fnNode,
      params,
      type: "inline-array",
      isShorthandMethod: isShorthand,
      propertyNode: propNode,
    });
  }

  /**
   * Add a $inject annotation target for a named function/class.
   * Inserts `Name.$inject = [...]` after the declaration node.
   *
   * @param fnNode - The function/class node whose params to read.
   * @param name - The identifier name to attach $inject to.
   * @param insertAfter - The statement node after which to insert $inject.
   */
  function addInject(fnNode: AcornNode, name: string, insertAfter: AcornNode): void {
    if (annotated.has(fnNode) || suppressed.has(fnNode)) return;
    /* v8 ignore next - ngNoInject detected earlier in walkNode via suppressed set */
    if (hasNgNoInject(fnNode)) return;
    const params = extractParams(fnNode);
    if (params.length === 0) return;
    annotated.add(fnNode);
    targets.push({
      node: fnNode,
      params,
      type: "$inject",
      name,
      insertAfterNode: insertAfter,
    });
  }

  /* ---------- Phase 1: Collect all top-level declarations ---------- */
  collectDeclarations(ast, declarations);

  /* ---------- Phase 2: Walk the AST and detect patterns ---------- */
  walkNode(ast, null, []);

  return targets;

  /**
   * Recursively walk the AST, detecting AngularJS patterns.
   * Uses a parent-tracking approach rather than estree-walker
   * for finer control over context.
   *
   * @param node - Current AST node being visited.
   * @param parent - The parent node (null for root).
   * @param ancestors - Full ancestor chain from root to current node.
   */
  function walkNode(node: AcornNode, parent: AcornNode | null, ancestors: AcornNode[]): void {
    /* Check for @ngNoInject suppression on this node. */
    if (hasNgNoInject(node)) {
      suppressed.add(node);
    }

    /* --- Explicit "ngInject" directive prologue --- */
    if (isFunctionLike(node) && hasNgInjectDirective(node)) {
      handleExplicitAnnotation(node, parent, ancestors);
    }

    /* --- "ngInject" in class constructor body --- */
    if (
      (node.type === "ClassDeclaration" || node.type === "ClassExpression") &&
      hasConstructorWithNgInject(node)
    ) {
      handleExplicitAnnotation(node, parent, ancestors);
    }

    /* --- Explicit @ngInject comment --- */
    if (hasNgInjectComment(node)) {
      handleExplicitAnnotation(node, parent, ancestors);
    }

    /*
     * --- @ngInject on export declarations ---
     * When `@ngInject` is placed before `export`, the comment attaches
     * to the ExportDeclaration, not the inner function/class. Forward
     * the annotation to the declaration child.
     */
    if (
      hasNgInjectComment(node) &&
      (node.type === "ExportDefaultDeclaration" || node.type === "ExportNamedDeclaration") &&
      node.declaration
    ) {
      handleExplicitAnnotation(node.declaration, node, ancestors);
    }

    /* --- Implicit pattern detection (skip if explicitOnly) --- */
    if (!options.explicitOnly) {
      if (node.type === "CallExpression") {
        handleCallExpression(node, ancestors);
      }
    }

    /* Recurse into children. */
    const newAncestors = [...ancestors, node];
    for (const key of Object.keys(node)) {
      if (key === "leadingComments") continue;
      const child = (node as Record<string, unknown>)[key];
      if (child && typeof child === "object" && "type" in (child as AcornNode)) {
        walkNode(child as AcornNode, node, newAncestors);
      } else if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            walkNode(item as AcornNode, node, newAncestors);
          }
        }
      }
    }
  }

  /**
   * Handle an explicit `@ngInject` annotation on a node.
   * Determines the correct annotation strategy based on the node
   * type and its position in the AST.
   *
   * @param node - The annotated node (function, class, or object).
   * @param parent - The parent AST node.
   * @param ancestors - Ancestor chain.
   */
  function handleExplicitAnnotation(
    node: AcornNode,
    parent: AcornNode | null,
    ancestors: AcornNode[],
  ): void {
    if (node.type === "ObjectExpression") {
      annotateObjectProperties(node);
      return;
    }

    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      handleClassAnnotation(node, parent, ancestors);
      return;
    }

    /* @ngInject on a Property node: annotate just that property's value. */
    if (node.type === "Property" && node.value && isFunctionLike(node.value as AcornNode)) {
      addInlineArray(node.value as AcornNode, !!node.method, node.method ? node : undefined);
      return;
    }

    if (!isFunctionLike(node)) return;

    /* Determine whether to use $inject or inline-array. */
    if (node.type === "FunctionDeclaration" && node.id?.name) {
      const stmt = findContainingStatement(node, ancestors);
      addInject(node, node.id.name, stmt || node);
    } else if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
      const varDecl = findAncestorOfType(ancestors, "VariableDeclaration");
      /* v8 ignore next - VariableDeclarator always has a VariableDeclaration ancestor */
      if (varDecl) {
        addInject(node, parent.id.name!, varDecl);
      }
    } else if (parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier") {
      const stmt = findContainingStatement(parent, ancestors);
      if (stmt) {
        addInject(node, parent.left.name!, stmt);
      }
    } else if (parent?.type === "Property" && parent.key?.type === "Identifier") {
      addInlineArray(node, !!parent.method, parent.method ? parent : undefined);
    } else if (
      parent?.type === "ExportDefaultDeclaration" ||
      parent?.type === "ExportNamedDeclaration"
    ) {
      if (node.type === "FunctionDeclaration" && node.id?.name) {
        addInject(node, node.id.name, parent);
      } else {
        addInlineArray(node);
      }
    } else {
      addInlineArray(node);
    }
  }

  /**
   * Handle a CallExpression, checking if it matches any known AngularJS pattern.
   *
   * @param node - The CallExpression node.
   * @param ancestors - Ancestor chain.
   */
  function handleCallExpression(node: AcornNode, ancestors: AcornNode[]): void {
    const callee = node.callee;
    if (!callee || callee.type !== "MemberExpression") return;

    const methodName = getMemberName(callee);
    if (!methodName) return;

    const args = node.arguments || [];

    /* --- Module methods with a name argument: .controller("Name", fn) --- */
    if (MODULE_METHODS_WITH_NAME.has(methodName) && args.length === 2) {
      // Guard: first arg must be a string literal (the registration name).
      // Without this, _.filter(collection, fn) would match because "filter" is in the list.
      if (args[0].type === "Literal" && typeof args[0].value === "string") {
        annotateArgument(args[1], ancestors);
      }
    }

    /* --- Module methods without name: .config(fn), .run(fn) --- */
    if (MODULE_METHODS_NO_NAME.has(methodName) && args.length >= 1) {
      annotateArgument(args[0], ancestors);
    }

    /* --- .provider("Name", fn) --- */
    if (methodName === "provider" && args.length >= 2) {
      const fnArg = args[1];
      if (isFunctionLike(fnArg)) {
        addInlineArray(fnArg);
        annotateProviderGet(fnArg);
      } else if (fnArg.type === "ObjectExpression") {
        annotateProviderGetInObject(fnArg);
      } else if (fnArg.type === "Identifier") {
        resolveAndAnnotateReference(fnArg.name!);
      }
    }

    /* --- .component("Name", configObj) --- */
    if (methodName === "component" && args.length >= 2) {
      const configArg = args[1];
      if (configArg.type === "ObjectExpression") {
        annotateComponentConfig(configArg);
      }
    }

    /* --- angular.module("Name", deps, configFn) --- */
    if (
      methodName === "module" &&
      callee.object?.type === "Identifier" &&
      callee.object.name === "angular" &&
      args.length >= 3
    ) {
      annotateArgument(args[2], ancestors);
    }

    /* --- $routeProvider.when("path", config) --- */
    if (methodName === "when" && isCalledOn(callee, "$routeProvider")) {
      if (args.length >= 2 && args[1].type === "ObjectExpression") {
        annotateRouteConfig(args[1]);
      }
    }

    /* --- $urlRouterProvider.when("path", fn) --- */
    if (methodName === "when" && isCalledOn(callee, "$urlRouterProvider")) {
      if (args.length >= 2) {
        annotateArgument(args[1], ancestors);
      }
    }

    /* --- $stateProvider.state("name", config) --- */
    if (methodName === "state" && isCalledOn(callee, "$stateProvider")) {
      if (args.length >= 2 && args[1].type === "ObjectExpression") {
        annotateStateConfig(args[1]);
      }
    }

    /* --- stateHelperProvider.setNestedState(config) --- */
    if (methodName === "setNestedState" && isCalledOn(callee, "stateHelperProvider")) {
      if (args.length >= 1 && args[0].type === "ObjectExpression") {
        annotateStateConfig(args[0]);
      }
    }

    /* --- $modal.open(config), $uibModal.open(config), $mdDialog.show(config) --- */
    if (
      (methodName === "open" || methodName === "show") &&
      isCalledOnAny(callee, DIALOG_SERVICES)
    ) {
      if (args.length >= 1 && args[0].type === "ObjectExpression") {
        annotateDialogConfig(args[0]);
      }
    }

    /* --- $injector.invoke(fn) --- */
    if (methodName === "invoke" && isCalledOn(callee, "$injector")) {
      if (args.length >= 1) {
        annotateArgument(args[0], ancestors);
      }
    }

    /* --- $provide.<method>("name", fn) --- */
    if (isCalledOn(callee, "$provide")) {
      if (MODULE_METHODS_WITH_NAME.has(methodName) && args.length === 2) {
        if (args[0].type === "Literal" && typeof args[0].value === "string") {
          annotateArgument(args[1], ancestors);
        }
      }
      if (methodName === "provider" && args.length >= 2) {
        const fnArg = args[1];
        if (isFunctionLike(fnArg)) {
          addInlineArray(fnArg);
          annotateProviderGet(fnArg);
        } else if (fnArg.type === "ObjectExpression") {
          annotateProviderGetInObject(fnArg);
        }
      }
    }

    /* --- $controllerProvider.register("name", fn) --- */
    if (methodName === "register" && isCalledOn(callee, "$controllerProvider")) {
      if (args.length >= 2) {
        annotateArgument(args[1], ancestors);
      }
    }

    /* --- $httpProvider.interceptors.push(fn) / $httpProvider.responseInterceptors.push(fn) --- */
    if (methodName === "push") {
      const obj = callee.object;
      if (obj?.type === "MemberExpression" && isCalledOn(obj, "$httpProvider")) {
        const propName = getMemberName(obj);
        if (propName === "interceptors" || propName === "responseInterceptors") {
          for (const arg of args) {
            annotateArgument(arg, ancestors);
          }
        }
      }
    }
  }

  /**
   * Annotate a function argument. If the argument is an identifier,
   * resolve the reference and annotate at the declaration site.
   * If it's a function, annotate inline.
   *
   * @param arg - The argument node (function, identifier, or other).
   * @param ancestors - Ancestor chain for context.
   */
  function annotateArgument(arg: AcornNode, _ancestors: AcornNode[]): void {
    if (isFunctionLike(arg)) {
      addInlineArray(arg);
    } else if (arg.type === "Identifier") {
      resolveAndAnnotateReference(arg.name!);
    }
  }

  /**
   * Resolve an identifier reference to its declaration and annotate
   * the declared function/class with `$inject`.
   *
   * @param name - The identifier name to resolve.
   */
  function resolveAndAnnotateReference(name: string): void {
    const decl = declarations.get(name);
    if (!decl) return;

    const { node: fnNode, declarationNode } = decl;

    if (fnNode.type === "ClassDeclaration" || fnNode.type === "ClassExpression") {
      const ctor = findConstructor(fnNode);
      if (ctor) {
        addInject(ctor, name, declarationNode);
      }
    } else if (isFunctionLike(fnNode)) {
      addInject(fnNode, name, declarationNode);
    }
  }

  /**
   * Annotate all function properties inside an object literal.
   * Used for explicit `@ngInject` on an entire object.
   *
   * @param objNode - The ObjectExpression node.
   */
  function annotateObjectProperties(objNode: AcornNode): void {
    for (const prop of objNode.properties || []) {
      if (prop.type !== "Property") continue;
      const val = prop.value as AcornNode | undefined;
      /* v8 ignore next - Property nodes always have a value in valid ASTs */
      if (!val) continue;
      if (isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      } else if (val.type === "ObjectExpression") {
        annotateObjectProperties(val);
      }
    }
  }

  /**
   * Annotate injectable properties in a `.component()` config object.
   * Handles `controller`, `template`, and `templateUrl`.
   *
   * @param configNode - The config ObjectExpression node.
   */
  function annotateComponentConfig(configNode: AcornNode): void {
    for (const prop of configNode.properties || []) {
      if (prop.type !== "Property") continue;
      const keyName = getPropertyKeyName(prop);
      if (!keyName || !COMPONENT_INJECTABLE_PROPS.has(keyName)) continue;
      const val = prop.value as AcornNode | undefined;
      if (val && isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      }
    }
  }

  /**
   * Annotate `$get` assignments and return values inside a `.provider()` body.
   * Detects `this.$get = fn`, `self.$get = fn`, `that.$get = fn`,
   * and `return { $get: fn }`.
   *
   * @param providerFn - The provider function node.
   */
  function annotateProviderGet(providerFn: AcornNode): void {
    const body = getFunctionBody(providerFn);
    /* v8 ignore next - providerFn is always function-like with a body */
    if (!body) return;

    for (const stmt of body) {
      walkForProviderGet(stmt);
    }
  }

  /**
   * Recursively search a provider function body for `$get` patterns.
   *
   * @param node - Current node being walked inside the provider body.
   */
  function walkForProviderGet(node: AcornNode): void {
    /* this.$get = fn  /  self.$get = fn  /  that.$get = fn */
    if (node.type === "ExpressionStatement" && node.expression?.type === "AssignmentExpression") {
      const left = node.expression.left;
      if (
        (left?.type === "MemberExpression" &&
          getMemberName(left) === "$get" &&
          left.object?.type === "ThisExpression") ||
        (left?.type === "MemberExpression" &&
          getMemberName(left) === "$get" &&
          left.object?.type === "Identifier" &&
          (left.object.name === "self" || left.object.name === "that"))
      ) {
        const right = node.expression.right;
        if (right && isFunctionLike(right)) {
          addInlineArray(right);
        }
      }
    }

    /* return { $get: fn } */
    if (node.type === "ReturnStatement" && node.argument?.type === "ObjectExpression") {
      annotateProviderGetInObject(node.argument);
    }

    /* Recurse into block children. */
    if (node.type === "BlockStatement" && Array.isArray(node.body)) {
      for (const child of node.body) {
        walkForProviderGet(child);
      }
    }
  }

  /**
   * Annotate `$get` in an object-form provider: `{ $get: function(...) {} }`.
   *
   * @param objNode - The ObjectExpression node.
   */
  function annotateProviderGetInObject(objNode: AcornNode): void {
    for (const prop of objNode.properties || []) {
      if (prop.type !== "Property") continue;
      const keyName = getPropertyKeyName(prop);
      if (keyName !== "$get") continue;
      const val = prop.value as AcornNode | undefined;
      if (val && isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      }
    }
  }

  /**
   * Annotate injectable properties in a route config object ($routeProvider.when).
   * Handles `controller` directly and all values in `resolve`.
   *
   * @param configNode - The route config ObjectExpression.
   */
  function annotateRouteConfig(configNode: AcornNode): void {
    for (const prop of configNode.properties || []) {
      if (prop.type !== "Property") continue;
      const keyName = getPropertyKeyName(prop);
      if (!keyName) continue;
      const val = prop.value as AcornNode | undefined;
      /* v8 ignore next - Property nodes always have a value */
      if (!val) continue;

      if (ROUTE_INJECTABLE_PROPS.has(keyName) && isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      }
      if (ROUTE_RESOLVE_PROPS.has(keyName) && val.type === "ObjectExpression") {
        annotateAllFunctionValues(val);
      }
    }
  }

  /**
   * Annotate injectable properties in a UI-Router state config object.
   * Handles `controller`, `controllerProvider`, `templateProvider`,
   * `onEnter`, `onExit`, `resolve` (all values), and nested `views`.
   *
   * @param configNode - The state config ObjectExpression.
   */
  function annotateStateConfig(configNode: AcornNode): void {
    for (const prop of configNode.properties || []) {
      if (prop.type !== "Property") continue;
      const keyName = getPropertyKeyName(prop);
      if (!keyName) continue;
      const val = prop.value as AcornNode | undefined;
      /* v8 ignore next - Property nodes always have a value */
      if (!val) continue;

      if (ROUTE_INJECTABLE_PROPS.has(keyName) && isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      }
      if (ROUTE_RESOLVE_PROPS.has(keyName) && val.type === "ObjectExpression") {
        annotateAllFunctionValues(val);
      }
      if (keyName === "views" && val.type === "ObjectExpression") {
        for (const viewProp of val.properties || []) {
          if (
            viewProp.type === "Property" &&
            (viewProp.value as AcornNode | undefined)?.type === "ObjectExpression"
          ) {
            annotateStateConfig(viewProp.value as AcornNode);
          }
        }
      }
      if (keyName === "children" && val.type === "ArrayExpression") {
        for (const child of val.elements || []) {
          if (child?.type === "ObjectExpression") {
            annotateStateConfig(child);
          }
        }
      }
    }
  }

  /**
   * Annotate injectable properties in a dialog/modal config object.
   * Handles `controller` and all values in `resolve`.
   *
   * @param configNode - The dialog config ObjectExpression.
   */
  function annotateDialogConfig(configNode: AcornNode): void {
    for (const prop of configNode.properties || []) {
      if (prop.type !== "Property") continue;
      const keyName = getPropertyKeyName(prop);
      if (!keyName) continue;
      const val = prop.value as AcornNode | undefined;
      /* v8 ignore next - Property nodes always have a value */
      if (!val) continue;

      if (keyName === "controller" && isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      }
      if (keyName === "resolve" && val.type === "ObjectExpression") {
        annotateAllFunctionValues(val);
      }
    }
  }

  /**
   * Annotate every function value in an ObjectExpression.
   * Used for `resolve` objects where all values are injectable.
   *
   * @param objNode - The ObjectExpression whose function values to annotate.
   */
  function annotateAllFunctionValues(objNode: AcornNode): void {
    for (const prop of objNode.properties || []) {
      if (prop.type !== "Property") continue;
      const val = prop.value as AcornNode | undefined;
      if (val && isFunctionLike(val)) {
        addInlineArray(val, !!prop.method, prop.method ? prop : undefined);
      }
    }
  }

  /**
   * Handle class annotation by finding and annotating the constructor.
   *
   * @param classNode - The ClassDeclaration or ClassExpression node.
   * @param parent - The parent node.
   * @param ancestors - Ancestor chain.
   */
  function handleClassAnnotation(
    classNode: AcornNode,
    parent: AcornNode | null,
    ancestors: AcornNode[],
  ): void {
    const ctor = findConstructor(classNode);
    if (!ctor) return;

    if (classNode.type === "ClassDeclaration" && classNode.id?.name) {
      const stmt = findContainingStatement(classNode, ancestors);
      addInject(ctor, classNode.id.name, stmt || classNode);
    } else if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
      const varDecl = findAncestorOfType(ancestors, "VariableDeclaration");
      /* v8 ignore next - VariableDeclarator always has a VariableDeclaration ancestor */
      if (varDecl) {
        addInject(ctor, parent.id.name!, varDecl);
      }
    } else if (parent?.type === "ExportDefaultDeclaration" && classNode.id?.name) {
      addInject(ctor, classNode.id.name, parent);
    }
  }
}

/* ================================================================
 * Utility functions
 * ================================================================ */

/**
 * Check if a node is a function expression, arrow function, or function declaration.
 *
 * @param node - The AST node to check.
 * @returns True if the node is a function-like construct.
 */
export function isFunctionLike(node: AcornNode): boolean {
  return (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

/**
 * Extract parameter names from a function node.
 * Handles Identifier params and default parameters (AssignmentPattern).
 *
 * @param fnNode - A function-like AST node.
 * @returns An array of parameter name strings.
 */
export function extractParams(fnNode: AcornNode): string[] {
  if (fnNode.type === "ClassDeclaration" || fnNode.type === "ClassExpression") {
    const ctor = findConstructor(fnNode);
    return ctor ? extractParams(ctor) : [];
  }

  const params = fnNode.params || [];
  const names: string[] = [];

  for (const param of params) {
    if (param.type === "Identifier" && param.name) {
      names.push(param.name);
    } else if (param.type === "AssignmentPattern" && param.left?.name) {
      names.push(param.left.name);
    }
  }

  return names;
}

/**
 * Get the property name from a MemberExpression node.
 *
 * @param memberExpr - A MemberExpression AST node.
 * @returns The property name string, or null if computed/dynamic.
 */
function getMemberName(memberExpr: AcornNode): string | null {
  if (memberExpr.computed) return null;
  if (memberExpr.property?.type === "Identifier") {
    return memberExpr.property.name || null;
  }
  /* v8 ignore next - MemberExpression property is always Identifier when not computed */
  return null;
}

/**
 * Get the key name from a Property node (supports identifiers and string literals).
 *
 * @param prop - A Property AST node.
 * @returns The key name string, or null if computed/dynamic.
 */
function getPropertyKeyName(prop: AcornNode): string | null {
  if (prop.computed) return null;
  if (prop.key?.type === "Identifier") return prop.key.name || null;
  if (prop.key?.type === "Literal" && typeof prop.key.value === "string") {
    return prop.key.value;
  }
  /* v8 ignore next - non-computed keys are always Identifier or string Literal */
  return null;
}

/**
 * Check if a MemberExpression is called on a specific identifier.
 * Handles both `identifier.method()` and chained calls like `identifier.foo().method()`.
 *
 * @param callee - The MemberExpression callee node.
 * @param name - The expected object identifier name.
 * @returns True if the callee's root object matches the name.
 */
function isCalledOn(callee: AcornNode, name: string): boolean {
  const obj = callee.object;
  /* v8 ignore next - MemberExpression always has an object */
  if (!obj) return false;
  if (obj.type === "Identifier" && obj.name === name) return true;
  if (obj.type === "CallExpression" && obj.callee?.type === "MemberExpression") {
    return isCalledOn(obj.callee, name);
  }
  return false;
}

/**
 * Check if a MemberExpression is called on any identifier from a set.
 *
 * @param callee - The MemberExpression callee node.
 * @param names - Set of identifier names to match against.
 * @returns True if the callee's root object matches any name in the set.
 */
function isCalledOnAny(callee: AcornNode, names: Set<string>): boolean {
  for (const name of names) {
    if (isCalledOn(callee, name)) return true;
  }
  /* v8 ignore next - always called with DIALOG_SERVICES which has 5 entries, at least one matches */
  return false;
}

/**
 * Get the body statements from a function node.
 *
 * @param fnNode - A function-like AST node.
 * @returns The body statements array, or null.
 */
function getFunctionBody(fnNode: AcornNode): AcornNode[] | null {
  const body = fnNode.body;
  /* v8 ignore next - function-like nodes always have a body */
  if (!body) return null;
  if (Array.isArray(body)) return body;
  if (body.type === "BlockStatement" && Array.isArray(body.body)) {
    return body.body;
  }
  /* v8 ignore next - function body is always BlockStatement or array */
  return null;
}

/**
 * Find the constructor method inside a class body.
 *
 * @param classNode - A ClassDeclaration or ClassExpression node.
 * @returns The constructor's FunctionExpression node, or null.
 */
function findConstructor(classNode: AcornNode): AcornNode | null {
  const body = classNode.body;
  /* v8 ignore next - class nodes always have a body */
  if (!body) return null;
  const methods = (body as AcornNode).body;
  /* v8 ignore next - ClassBody always has a body array */
  if (!Array.isArray(methods)) return null;

  for (const method of methods) {
    if (method.type === "MethodDefinition" && method.kind === "constructor" && method.value) {
      return method.value as AcornNode;
    }
  }
  return null;
}

/**
 * Check if a function has an `"ngInject"` directive prologue in its body.
 *
 * @param fnNode - A function-like AST node.
 * @returns True if the function body starts with `"ngInject"`.
 */
function hasNgInjectDirective(fnNode: AcornNode): boolean {
  const body = getFunctionBody(fnNode);
  if (!body || body.length === 0) return false;

  for (const stmt of body) {
    if (
      stmt.type === "ExpressionStatement" &&
      stmt.expression?.type === "Literal" &&
      typeof stmt.expression.value === "string"
    ) {
      if (stmt.expression.value === "ngInject") return true;
      continue;
    }
    break;
  }
  return false;
}

/**
 * Check if a class has a constructor with an `"ngInject"` directive prologue.
 *
 * @param classNode - A ClassDeclaration or ClassExpression node.
 * @returns True if the constructor body starts with `"ngInject"`.
 */
function hasConstructorWithNgInject(classNode: AcornNode): boolean {
  const ctor = findConstructor(classNode);
  if (!ctor) return false;
  return hasNgInjectDirective(ctor);
}

/**
 * Check if a node has a leading `@ngInject` comment.
 *
 * @param node - The AST node to check.
 * @returns True if a leading comment contains `@ngInject`.
 */
function hasNgInjectComment(node: AcornNode): boolean {
  if (!node.leadingComments) return false;
  return node.leadingComments.some(
    (c) =>
      c.value.trim() === "@ngInject" ||
      c.value.split("\n").some((line) => line.trim().replace(/^\*\s*/, "") === "@ngInject"),
  );
}

/**
 * Check if a node is suppressed via `@ngNoInject` comment or `"ngNoInject"` directive.
 *
 * @param node - The AST node to check.
 * @returns True if annotation should be suppressed for this node.
 */
function hasNgNoInject(node: AcornNode): boolean {
  if (node.leadingComments) {
    if (node.leadingComments.some((c) => c.value.trim() === "@ngNoInject")) {
      return true;
    }
  }
  if (isFunctionLike(node)) {
    const body = getFunctionBody(node);
    if (body) {
      for (const stmt of body) {
        if (
          stmt.type === "ExpressionStatement" &&
          stmt.expression?.type === "Literal" &&
          stmt.expression.value === "ngNoInject"
        ) {
          return true;
        }
        if (stmt.type !== "ExpressionStatement" || stmt.expression?.type !== "Literal") {
          break;
        }
      }
    }
  }
  return false;
}

/**
 * Find the nearest ancestor of a given type in the ancestor chain.
 *
 * @param ancestors - Array of ancestor nodes from root to current.
 * @param type - The node type string to search for.
 * @returns The matching ancestor node, or null.
 */
function findAncestorOfType(ancestors: AcornNode[], type: string): AcornNode | null {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].type === type) return ancestors[i];
  }
  /* v8 ignore next - callers ensure the ancestor type exists */
  return null;
}

/**
 * Find the statement-level node that contains the given node.
 * Walks up the ancestor chain to find the closest statement.
 *
 * @param node - The node to find the containing statement for.
 * @param ancestors - Ancestor chain.
 * @returns The containing statement node, or the node itself.
 */
function findContainingStatement(node: AcornNode, ancestors: AcornNode[]): AcornNode | null {
  const chain = [...ancestors, node];
  for (let i = chain.length - 1; i >= 1; i--) {
    const parent = chain[i - 1];
    if (
      parent.type === "Program" ||
      parent.type === "BlockStatement" ||
      parent.type === "ExportDefaultDeclaration" ||
      parent.type === "ExportNamedDeclaration"
    ) {
      return chain[i];
    }
  }
  /* v8 ignore next - every node has at least Program as ancestor */
  return chain[0] || null;
}

/**
 * Collect all top-level function/class/variable declarations in the AST.
 * Populates a map from name to { node, declarationNode } for reference resolution.
 *
 * Also descends into IIFE bodies (`(function () { ... })()`, arrow IIFEs,
 * and unary-prefix `!function () { ... }()` variants) so that AngularJS
 * modules wrapped in the historical IIFE idiom still resolve identifier
 * references like `.factory("foo", foo)` to their declaration site.
 *
 * @param ast - The root AST node (Program).
 * @param declarations - Map to populate with declaration info.
 */
function collectDeclarations(
  ast: AcornNode,
  declarations: Map<string, { node: AcornNode; declarationNode: AcornNode }>,
): void {
  const body = ast.body;
  /* v8 ignore next - Program nodes always have a body array */
  if (!Array.isArray(body)) return;

  for (const stmt of body) {
    processDeclarationStatement(stmt, stmt, declarations);
    collectFromIIFE(stmt, declarations);
  }
}

/**
 * If `stmt` is an IIFE-style expression statement, recurse into its body
 * and register every declaration found there. The `topStmt` for each inner
 * declaration is the inner declaration itself, so injected `Name.$inject`
 * lines are appended right after the declaration — inside the IIFE block,
 * not at the program top-level.
 *
 * @param stmt - A program-level statement to probe for an IIFE shape.
 * @param declarations - Map to populate with any nested declarations.
 */
function collectFromIIFE(
  stmt: AcornNode,
  declarations: Map<string, { node: AcornNode; declarationNode: AcornNode }>,
): void {
  if (stmt.type !== "ExpressionStatement") return;
  let expr = stmt.expression;
  /* `!function(){}()` / `+function(){}()` / `void function(){}()` etc. */
  if (expr?.type === "UnaryExpression") expr = expr.argument;
  if (expr?.type !== "CallExpression") return;
  const callee = expr.callee;
  if (
    !callee ||
    (callee.type !== "FunctionExpression" && callee.type !== "ArrowFunctionExpression")
  ) {
    return;
  }
  const fnBody = callee.body;
  /* Arrow IIFEs can have a non-block body (`(() => 1)()`); nothing to recurse into there. */
  if (!fnBody || Array.isArray(fnBody) || fnBody.type !== "BlockStatement") return;
  const innerBody = fnBody.body;
  if (!Array.isArray(innerBody)) return;
  for (const inner of innerBody) {
    processDeclarationStatement(inner, inner, declarations);
    /* Defensive: nested IIFEs (rare but legal). */
    collectFromIIFE(inner, declarations);
  }
}

/**
 * Process a single statement to extract declaration info.
 * Handles FunctionDeclaration, ClassDeclaration, VariableDeclaration,
 * and export wrappers.
 *
 * @param stmt - The statement node.
 * @param topStmt - The top-level statement (for export wrappers).
 * @param declarations - Map to populate.
 */
function processDeclarationStatement(
  stmt: AcornNode,
  topStmt: AcornNode,
  declarations: Map<string, { node: AcornNode; declarationNode: AcornNode }>,
): void {
  if (stmt.type === "FunctionDeclaration" && stmt.id?.name) {
    declarations.set(stmt.id.name, {
      node: stmt,
      declarationNode: topStmt,
    });
  } else if (stmt.type === "ClassDeclaration" && stmt.id?.name) {
    declarations.set(stmt.id.name, {
      node: stmt,
      declarationNode: topStmt,
    });
  } else if (stmt.type === "VariableDeclaration" && stmt.declarations) {
    for (const decl of stmt.declarations) {
      if (
        decl.type === "VariableDeclarator" &&
        decl.id?.type === "Identifier" &&
        decl.id.name &&
        decl.init
      ) {
        if (isFunctionLike(decl.init) || decl.init.type === "ClassExpression") {
          declarations.set(decl.id.name, {
            node: decl.init,
            declarationNode: topStmt,
          });
        }
      }
    }
  } else if (
    (stmt.type === "ExportDefaultDeclaration" || stmt.type === "ExportNamedDeclaration") &&
    stmt.declaration
  ) {
    processDeclarationStatement(stmt.declaration, topStmt, declarations);
  }
}
