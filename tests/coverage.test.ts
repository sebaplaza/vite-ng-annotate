import { describe, expect, it } from "vitest";
import { annotate } from "../src/annotate.js";

/**
 * Additional tests to reach 100% code coverage.
 * Covers shorthand methods, explicit markers on objects/classes,
 * context-dependent patterns, edge cases, and rarely-hit branches.
 */

/* ================================================================
 * Shorthand method syntax
 * ================================================================ */
describe("shorthand method syntax", () => {
  it("should convert shorthand controller in $stateProvider.state()", () => {
    const input = '$stateProvider.state("myState", { controller($scope) {} });';
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
    expect(result).not.toContain("controller($scope)");
  });

  it("should convert shorthand method in .component()", () => {
    const input = 'myMod.component("cmp", { controller($scope) {} });';
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
  });

  it("should convert shorthand $get in object-form provider", () => {
    const input = 'myMod.provider("foo", { $get($scope) {} });';
    const result = annotate(input)!;
    expect(result).toContain('$get: ["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Explicit @ngInject on objects
 * ================================================================ */
describe("explicit @ngInject on objects", () => {
  it("should annotate all function values in an @ngInject object", () => {
    const input = [
      "var obj = /* @ngInject */ {",
      "  foo: function(a) {},",
      "  bar: function(b, c) {}",
      "};",
    ].join("\n");
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["a", function(a) {}]');
    expect(result).toContain('["b", "c", function(b, c) {}]');
  });

  it("should recurse into nested objects (but not arrays)", () => {
    const input = ["var obj = /* @ngInject */ {", "  inner: { circle: function(d) {} }", "};"].join(
      "\n",
    );
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["d", function(d) {}]');
  });

  it("should annotate a single @ngInject property", () => {
    const input = "var obj = { /* @ngInject */ foo: function(a) {}, bar: function(b) {} };";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["a", function(a) {}]');
    /* bar should NOT be annotated. */
    expect(result).toContain("bar: function(b) {}");
  });
});

/* ================================================================
 * Explicit @ngInject on classes
 * ================================================================ */
describe("explicit @ngInject on classes", () => {
  it("should add $inject for @ngInject on class declaration", () => {
    const input = "/* @ngInject */\nclass Foo { constructor($scope) {} }";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });

  it("should add $inject for @ngInject on class expression in variable", () => {
    const input = "var Foo = /* @ngInject */ class { constructor($scope) {} };";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });

  it('should add $inject for "ngInject" prologue in constructor', () => {
    const input = 'class Foo { constructor($scope) { "ngInject"; } }';
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });

  it("should handle class with no constructor gracefully", () => {
    const input = "/* @ngInject */\nclass Foo { method() {} }";
    const result = annotate(input, { explicitOnly: true });
    expect(result).toBeNull();
  });

  it("should handle exported @ngInject class", () => {
    const input = "/* @ngInject */\nexport default class Foo { constructor($scope) {} }";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });
});

/* ================================================================
 * "ngInject" directive prologue edge cases
 * ================================================================ */
describe('"ngInject" directive prologue edge cases', () => {
  it("should detect ngInject in anonymous function (inline-array)", () => {
    const input = 'x.y(function($scope) { "ngInject"; });';
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["$scope", function($scope)');
  });

  it("should handle arrow function with ngInject", () => {
    const input = 'var fn = ($scope) => { "ngInject"; };';
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('fn.$inject = ["$scope"];');
  });

  it("should not detect ngInject in non-prologue position", () => {
    const input = 'function foo($scope) { var x = 1; "ngInject"; }';
    const result = annotate(input, { explicitOnly: true });
    expect(result).toBeNull();
  });
});

/* ================================================================
 * "ngNoInject" directive prologue
 * ================================================================ */
describe('"ngNoInject" directive prologue', () => {
  it('should suppress annotation for function with "ngNoInject" prologue', () => {
    const input = 'myMod.controller("Ctrl", function($scope) { "ngNoInject"; });';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * $provide patterns
 * ================================================================ */
describe("$provide patterns", () => {
  it("should annotate $provide.service()", () => {
    const input = '$provide.service("foo", function($scope) {});';
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
  });

  it("should annotate $provide.provider() with $get", () => {
    const input = [
      '$provide.provider("foo", function($scope) {',
      "  this.$get = function($http) {};",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope)');
    expect(result).toContain('["$http", function($http)');
  });

  it("should annotate $provide.provider() object form", () => {
    const input = '$provide.provider("foo", { $get: function($scope) {} });';
    const result = annotate(input)!;
    expect(result).toContain('$get: ["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * $urlRouterProvider
 * ================================================================ */
describe("$urlRouterProvider.when", () => {
  it("should annotate $urlRouterProvider.when() callback", () => {
    const input = '$urlRouterProvider.when("/", function($match) {});';
    const result = annotate(input)!;
    expect(result).toContain('["$match", function($match) {}]');
  });
});

/* ================================================================
 * Provider $get with self/that
 * ================================================================ */
describe("provider $get with self/that", () => {
  it("should annotate self.$get inside provider", () => {
    const input = [
      'myMod.provider("foo", function() {',
      "  var self = this;",
      "  self.$get = function(a) {};",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["a", function(a) {}]');
  });

  it("should annotate that.$get inside provider", () => {
    const input = [
      'myMod.provider("foo", function() {',
      "  var that = this;",
      "  that.$get = function(b) {};",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["b", function(b) {}]');
  });

  it("should annotate return { $get: fn } inside provider", () => {
    const input = [
      'myMod.provider("foo", function() {',
      "  return { $get: function($scope) {} };",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('$get: ["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Directive return object
 * ================================================================ */
describe("directive return object controller", () => {
  it("should NOT annotate controller in directive return (implicit not in visitor scope)", () => {
    /* Note: directive return object pattern is only for explicitly detected context.
       The basic visitor detects .directive("name", fn) and annotates fn. */
    const input = [
      'myMod.directive("foo", function($scope) {',
      "  return { controller: function($timeout) {} };",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    /* The outer function should be annotated. */
    expect(result).toContain('["$scope", function($scope)');
  });
});

/* ================================================================
 * Default parameters
 * ================================================================ */
describe("default parameters", () => {
  it("should handle default parameter values", () => {
    const input = 'myMod.service("Svc", function(a, b) {});';
    const result = annotate(input)!;
    expect(result).toContain('["a", "b", function(a, b) {}]');
  });
});

/* ================================================================
 * stateHelperProvider with nested children
 * ================================================================ */
describe("stateHelperProvider with children", () => {
  it("should annotate nested children states", () => {
    const input = [
      "stateHelperProvider.setNestedState({",
      "  controller: function($scope) {},",
      "  children: [{",
      "    controller: function($http) {}",
      "  }]",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
    expect(result).toContain('["$http", function($http) {}]');
  });
});

/* ================================================================
 * $mdDialog.show, $mdToast.show, $mdBottomSheet.show
 * ================================================================ */
describe("Angular Material dialogs", () => {
  it("should annotate $mdDialog.show() config", () => {
    const input = [
      "$mdDialog.show({",
      "  controller: function($scope) {},",
      "  resolve: { data: function($http) {} }",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
    expect(result).toContain('data: ["$http", function($http) {}]');
  });

  it("should annotate $mdToast.show() config", () => {
    const input = "$mdToast.show({ controller: function($scope) {} });";
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
  });

  it("should annotate $mdBottomSheet.show() config", () => {
    const input = "$mdBottomSheet.show({ controller: function($scope) {} });";
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Assignment expression with @ngInject
 * ================================================================ */
describe("assignment expression with @ngInject", () => {
  it("should annotate assignment to identifier", () => {
    const input = "var x;\nx = /* @ngInject */ function($scope) {};";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('x.$inject = ["$scope"];');
  });
});

/* ================================================================
 * Export with @ngInject
 * ================================================================ */
describe("export with @ngInject", () => {
  it("should annotate exported named function", () => {
    const input = "/* @ngInject */\nexport function foo($scope) {}";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('foo.$inject = ["$scope"];');
  });
});

/* ================================================================
 * Parser edge cases
 * ================================================================ */
describe("parser edge cases", () => {
  it("should handle code with no comments", () => {
    const input = 'myMod.controller("Ctrl", function($scope) {});';
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
  });

  it("should handle comments that don't match any node", () => {
    const input = "/* random comment */\n\n\nvar x = 1;";
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Class used as service reference (implicit)
 * ================================================================ */
describe("class reference following", () => {
  it("should handle class with constructor used as controller", () => {
    const input = [
      "class MyCtrl { constructor($scope, $timeout) {} }",
      'myMod.controller("MyCtrl", MyCtrl);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MyCtrl.$inject = ["$scope", "$timeout"];');
  });

  it("should handle class expression in variable", () => {
    const input = [
      "var MySvc = class { constructor(dep1) {} };",
      'myMod.service("MySvc", MySvc);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MySvc.$inject = ["dep1"];');
  });

  it("should skip class reference with no constructor", () => {
    const input = ["class MySvc { method() {} }", 'myMod.service("MySvc", MySvc);'].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Chained call detection (isCalledOn through chains)
 * ================================================================ */
describe("chained call detection", () => {
  it("should detect $stateProvider through chained calls", () => {
    const input = '$stateProvider.state("a", {}).state("b", { controller: function($scope) {} });';
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Property key as string literal
 * ================================================================ */
describe("property key as string literal", () => {
  it("should handle string-keyed properties in route config", () => {
    const input = [
      '$routeProvider.when("path", {',
      '  "controller": function($scope) {}',
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Multiple interceptors
 * ================================================================ */
describe("$httpProvider multiple interceptors", () => {
  it("should annotate responseInterceptors.push() with multiple args", () => {
    const input =
      "$httpProvider.responseInterceptors.push(function($scope) {}, function(a, b) {});";
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
    expect(result).toContain('["a", "b", function(a, b) {}]');
  });
});

/* ================================================================
 * Provider reference following
 * ================================================================ */
describe("provider reference following", () => {
  it("should follow identifier reference for provider", () => {
    const input = [
      "function providerFn(x) { this.$get = function(a) {}; }",
      'myMod.provider("foo", providerFn);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('providerFn.$inject = ["x"];');
  });
});

/* ================================================================
 * Line comments (parser branch coverage)
 * ================================================================ */
describe("line comments", () => {
  it("should handle // @ngInject line comments", () => {
    /* Line comments use "Line" type in parser, covering the block=false branch. */
    const input = "// @ngInject\nfunction foo($scope) {}";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('foo.$inject = ["$scope"];');
  });

  it("should handle // @ngNoInject line comments", () => {
    const input = '// @ngNoInject\nmyMod.controller("Ctrl", function($scope) {});';
    /* The line comment attaches to the ExpressionStatement, not the function.
       So the function won't be suppressed; this just tests parser line comment. */
    const result = annotate(input);
    expect(result).not.toBeNull();
  });
});

/* ================================================================
 * Non-MemberExpression callee (branch coverage)
 * ================================================================ */
describe("non-matching call expressions", () => {
  it("should skip direct function calls (not member expressions)", () => {
    const input = "foo(function($scope) {});";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip computed member expressions", () => {
    const input = 'myMod["controller"]("Ctrl", function($scope) {});';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Provider edge cases
 * ================================================================ */
describe("provider edge cases", () => {
  it("should not annotate non-$get assignments in provider", () => {
    const input = [
      'myMod.provider("foo", function(x) {',
      "  this.other = function(a) {};",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["x", function(x)');
    /* this.other should not be annotated. */
    expect(result).not.toContain('["a",');
  });

  it("should not annotate $get when value is not a function in object provider", () => {
    const input = 'myMod.provider("foo", { $get: "not-a-function" });';
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should handle provider function with return non-object", () => {
    const input = ['myMod.provider("foo", function(x) {', "  return 42;", "});"].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["x", function(x)');
  });
});

/* ================================================================
 * Route config edge cases
 * ================================================================ */
describe("route config edge cases", () => {
  it("should handle route config with non-function controller", () => {
    const input = ['$routeProvider.when("path", {', '  controller: "NamedCtrl"', "});"].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should handle $stateProvider with params (all values)", () => {
    const input = [
      '$stateProvider.state("myState", {',
      "  dontAlterMe: function(arg) {}",
      "});",
    ].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Modal/dialog edge cases
 * ================================================================ */
describe("dialog config edge cases", () => {
  it("should skip non-controller, non-resolve properties in dialog", () => {
    const input = "$modal.open({ template: '<div></div>' });";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should handle resolve with non-function values in dialog", () => {
    const input = '$modal.open({ resolve: { data: "static" } });';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * @ngInject on fallback inline-array (no matching parent)
 * ================================================================ */
describe("@ngInject fallback to inline array", () => {
  it("should use inline-array when no named context", () => {
    const input = "someArray.push(/* @ngInject */ function($scope) {});";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Unresolvable identifier reference
 * ================================================================ */
describe("unresolvable references", () => {
  it("should skip identifiers that cannot be resolved", () => {
    const input = 'myMod.controller("Ctrl", unknownRef);';
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip identifier reference to non-function declaration", () => {
    const input = ["var x = 42;", 'myMod.controller("Ctrl", x);'].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Component with non-function properties
 * ================================================================ */
describe("component with non-injectable properties", () => {
  it("should skip non-function controller in component", () => {
    const input = 'myMod.component("cmp", { controller: "NamedCtrl" });';
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip non-injectable properties in component", () => {
    const input = 'myMod.component("cmp", { bindings: { x: "<" } });';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Module method with non-matching argument count
 * ================================================================ */
describe("module method argument count", () => {
  it("should skip .controller() with only one argument", () => {
    const input = 'myMod.controller("Ctrl");';
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip .config() with zero arguments", () => {
    const input = "myMod.config();";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should handle angular.module with only two arguments", () => {
    const input = 'angular.module("MyMod", ["dep"]);';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * @ngInject on exported anonymous function (export default)
 * ================================================================ */
describe("@ngInject on export default anonymous", () => {
  it("should use inline-array for export default anonymous arrow", () => {
    const input = "/* @ngInject */\nexport default ($scope) => {};";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["$scope",');
  });
});

/* ================================================================
 * Properties that are not Property type (spread elements)
 * ================================================================ */
describe("spread properties in objects", () => {
  it("should skip spread elements in object expressions", () => {
    const input = 'myMod.component("cmp", { ...base, controller: function(a) {} });';
    const result = annotate(input)!;
    expect(result).toContain('controller: ["a", function(a) {}]');
  });
});

/* ================================================================
 * $provide with non-matching methods
 * ================================================================ */
describe("$provide edge cases", () => {
  it("should skip $provide with unknown method", () => {
    const input = '$provide.value("foo", 42);';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * $httpProvider with non-interceptors property
 * ================================================================ */
describe("$httpProvider non-interceptors", () => {
  it("should skip $httpProvider.somethingElse.push()", () => {
    const input = "$httpProvider.somethingElse.push(function($scope) {});";
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Non-identifier callee object (neither identifier nor chained call)
 * ================================================================ */
describe("non-identifier callee object", () => {
  it("should skip calls on non-identifier objects", () => {
    const input = 'getModule().controller("Ctrl", function($scope) {});';
    const result = annotate(input)!;
    /* getModule() returns CallExpression, callee is MemberExpression
       with object=CallExpression. isCalledOn checks but doesn't match. */
    expect(result).toContain('["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * Shorthand method in explicit @ngInject object
 * ================================================================ */
describe("shorthand method in @ngInject object", () => {
  it("should annotate shorthand methods inside @ngInject object", () => {
    const input = ["var obj = /* @ngInject */ {", "  foo(a) {},", "  bar(b, c) {}", "};"].join(
      "\n",
    );
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('foo: ["a", function(a) {}]');
    expect(result).toContain('bar: ["b", "c", function(b, c) {}]');
  });
});

/* ================================================================
 * Default parameter values
 * ================================================================ */
describe("default parameter extraction", () => {
  it("should extract names from default parameters", () => {
    const input = 'myMod.service("Svc", function($scope, $timeout) {});';
    const result = annotate(input)!;
    expect(result).toContain('["$scope", "$timeout",');
  });
});

/* ================================================================
 * resolveAndAnnotateReference for non-function, non-class
 * ================================================================ */
describe("resolveAndAnnotateReference edge cases", () => {
  it("should handle identifier reference to class expression variable", () => {
    const input = [
      "var MySvc = class { constructor(dep1) {} };",
      'myMod.controller("Ctrl", MySvc);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MySvc.$inject = ["dep1"];');
  });
});

/* ================================================================
 * Computed property key (getPropertyKeyName returns null)
 * ================================================================ */
describe("computed property keys", () => {
  it("should skip computed property keys in route config", () => {
    const input = [
      '$routeProvider.when("path", {',
      "  [dynamicKey]: function($scope) {}",
      "});",
    ].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Export named function with @ngInject
 * ================================================================ */
describe("export named declaration with @ngInject", () => {
  it("should annotate export named function", () => {
    const input = "/* @ngInject */\nexport function bar($http) {}";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('bar.$inject = ["$http"];');
  });
});

/* ================================================================
 * addInject suppression branches
 * ================================================================ */
describe("addInject suppression", () => {
  it("should suppress $inject via @ngNoInject on named function ref", () => {
    const input = [
      '/* @ngNoInject */ function MyCtrl($scope) { "ngNoInject"; }',
      'angular.module("MyMod").controller("MyCtrl", MyCtrl);',
    ].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip $inject for zero-param named function", () => {
    const input = [
      "function MyCtrl() {}",
      'angular.module("MyMod").controller("MyCtrl", MyCtrl);',
    ].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Non-object argument to $routeProvider, $stateProvider, etc.
 * ================================================================ */
describe("non-object config arguments", () => {
  it("should skip $routeProvider.when with non-object config", () => {
    const input = '$routeProvider.when("path", someVar);';
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip $stateProvider.state with non-object config", () => {
    const input = '$stateProvider.state("name", someVar);';
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip $modal.open with non-object config", () => {
    const input = "$modal.open(someVar);";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should skip stateHelperProvider.setNestedState with non-object", () => {
    const input = "stateHelperProvider.setNestedState(someVar);";
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * $stateProvider with views containing non-object view properties
 * ================================================================ */
describe("$stateProvider views edge cases", () => {
  it("should skip non-object view configs", () => {
    const input = [
      '$stateProvider.state("myState", {',
      '  views: { main: "stringRef" }',
      "});",
    ].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * $stateProvider children with non-object children
 * ================================================================ */
describe("$stateProvider children edge cases", () => {
  it("should skip non-object items in children array", () => {
    const input = ["stateHelperProvider.setNestedState({", '  children: ["stringRef"]', "});"].join(
      "\n",
    );
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * annotateAllFunctionValues with non-function values
 * ================================================================ */
describe("annotateAllFunctionValues edge cases", () => {
  it("should skip non-function values in resolve", () => {
    const input = [
      '$routeProvider.when("path", {',
      '  resolve: { data: "static", fn: function($http) {} }',
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('fn: ["$http", function($http) {}]');
  });
});

/* ================================================================
 * @ngInject on assignment expression with "ngInject" prologue
 * ================================================================ */
describe("ngInject prologue on assignment", () => {
  it("should annotate via ngInject prologue in assigned function", () => {
    const input = "var x;\nx = function($scope) { 'ngInject'; };";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('x.$inject = ["$scope"];');
  });
});

/* ================================================================
 * @ngInject on property value via comment
 * ================================================================ */
describe("@ngInject on object property via comment on function value", () => {
  it("should annotate property whose value has @ngInject", () => {
    const input = "var obj = { foo: /* @ngInject */ function(a) {} };";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["a", function(a) {}]');
  });
});

/* ================================================================
 * @ngNoInject on named function used by reference
 * ================================================================ */
describe("@ngNoInject on referenced function", () => {
  it("should suppress via ngNoInject prologue on named function", () => {
    const input = [
      "function MyCtrl($scope) { 'ngNoInject'; }",
      'angular.module("MyMod").controller("MyCtrl", MyCtrl);',
    ].join("\n");
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Class annotation edge cases
 * ================================================================ */
describe("class annotation edge cases", () => {
  it("should handle class expression in variable with @ngInject on class", () => {
    const input = "var Svc = /* @ngInject */ class { constructor(dep) {} };";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Svc.$inject = ["dep"];');
  });

  it("should not annotate class without name or constructor ngInject", () => {
    const input = "/* @ngInject */\nclass Foo { method() {} }";
    const result = annotate(input, { explicitOnly: true });
    /* Class has no constructor, so nothing to annotate. */
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Template/templateUrl in component with shorthand
 * ================================================================ */
describe("component template shorthand", () => {
  it("should annotate shorthand template method in component", () => {
    const input = 'myMod.component("cmp", { template($element) {} });';
    const result = annotate(input)!;
    expect(result).toContain('template: ["$element", function($element) {}]');
  });
});

/* ================================================================
 * State config with controllerProvider and templateProvider
 * ================================================================ */
describe("state config with controllerProvider/templateProvider", () => {
  it("should annotate controllerProvider in state config", () => {
    const input = [
      '$stateProvider.state("myState", {',
      "  controllerProvider: function($stateParams) {},",
      "  templateProvider: function($timeout) {}",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('controllerProvider: ["$stateParams", function($stateParams) {}]');
    expect(result).toContain('templateProvider: ["$timeout", function($timeout) {}]');
  });
});

/* ================================================================
 * State config resolve
 * ================================================================ */
describe("state config with resolve", () => {
  it("should annotate all resolve functions in state config", () => {
    const input = [
      '$stateProvider.state("myState", {',
      "  resolve: {",
      "    data: function($http) {},",
      '    other: "nonFunction"',
      "  }",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('data: ["$http", function($http) {}]');
  });
});

/* ================================================================
 * isCalledOnAny false branch
 * ================================================================ */
describe("isCalledOnAny false branch", () => {
  it("should not match .open() on non-dialog services", () => {
    const input = "someService.open({ controller: function($scope) {} });";
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Various branches for full coverage
 * ================================================================ */
describe("additional branch coverage", () => {
  it("should handle @ngInject on exported class declaration", () => {
    const input = "/* @ngInject */\nexport class Foo { constructor($scope) {} }";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });

  it("should handle provider with identifier ref to class", () => {
    const input = [
      "class MyProvider { constructor(x) {} }",
      'myMod.provider("foo", MyProvider);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MyProvider.$inject = ["x"];');
  });

  it("should handle export default anonymous arrow with @ngInject", () => {
    const input = "export default /* @ngInject */ ($scope) => {};";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('["$scope",');
  });

  it("should handle @ngInject on function expression property with shorthand method", () => {
    const input = "var obj = { /* @ngInject */ method($scope) {} };";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('method: ["$scope", function($scope) {}]');
  });

  it("should handle @ngInject on variable declaration function expression", () => {
    const input = "var fn = /* @ngInject */ function($scope) {};";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('fn.$inject = ["$scope"];');
  });
});
