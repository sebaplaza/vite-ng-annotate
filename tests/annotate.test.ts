import { describe, expect, it } from "vitest";
import { annotate } from "../src/annotate.js";

/**
 * Helper that annotates code with default (implicit) options
 * and asserts the result matches the expected output.
 */
function expectAnnotation(input: string, expected: string): void {
  const result = annotate(input);
  expect(result).toBe(expected);
}

/* ================================================================
 * Module methods with name argument
 * ================================================================ */
describe("module methods with name argument", () => {
  it("should annotate .controller()", () => {
    expectAnnotation(
      'myMod.controller("MyCtrl", function($scope, $timeout) {});',
      'myMod.controller("MyCtrl", ["$scope", "$timeout", function($scope, $timeout) {}]);',
    );
  });

  it("should annotate .service()", () => {
    expectAnnotation(
      'myMod.service("MySvc", function($http) {});',
      'myMod.service("MySvc", ["$http", function($http) {}]);',
    );
  });

  it("should annotate .factory()", () => {
    expectAnnotation(
      'myMod.factory("MyFact", function($q, $http) {});',
      'myMod.factory("MyFact", ["$q", "$http", function($q, $http) {}]);',
    );
  });

  it("should annotate .filter()", () => {
    expectAnnotation(
      'myMod.filter("myFilter", function($sce) {});',
      'myMod.filter("myFilter", ["$sce", function($sce) {}]);',
    );
  });

  it("should annotate .directive()", () => {
    expectAnnotation(
      'myMod.directive("myDir", function($compile) {});',
      'myMod.directive("myDir", ["$compile", function($compile) {}]);',
    );
  });

  it("should annotate .animation()", () => {
    expectAnnotation(
      'myMod.animation("myAnim", function($animate) {});',
      'myMod.animation("myAnim", ["$animate", function($animate) {}]);',
    );
  });

  it("should annotate .decorator()", () => {
    expectAnnotation(
      'myMod.decorator("myDec", function($delegate) {});',
      'myMod.decorator("myDec", ["$delegate", function($delegate) {}]);',
    );
  });

  it("should not annotate functions with zero parameters", () => {
    const code = 'myMod.controller("MyCtrl", function() {});';
    const result = annotate(code);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * Module methods without name argument
 * ================================================================ */
describe("module methods without name argument", () => {
  it("should annotate .config()", () => {
    expectAnnotation(
      "myMod.config(function($interpolateProvider) {});",
      'myMod.config(["$interpolateProvider", function($interpolateProvider) {}]);',
    );
  });

  it("should annotate .run()", () => {
    expectAnnotation(
      "myMod.run(function($rootScope) {});",
      'myMod.run(["$rootScope", function($rootScope) {}]);',
    );
  });
});

/* ================================================================
 * Provider with $get
 * ================================================================ */
describe("provider with $get", () => {
  it("should annotate provider function and this.$get", () => {
    const input = [
      'myMod.provider("foo", function(x) {',
      "  this.$get = function(a, b) {};",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["x", function(x)');
    expect(result).toContain('["a", "b", function(a, b)');
  });

  it("should annotate object-form provider $get", () => {
    expectAnnotation(
      'myMod.provider("foo", { $get: function($scope) {} });',
      'myMod.provider("foo", { $get: ["$scope", function($scope) {}] });',
    );
  });
});

/* ================================================================
 * Component config
 * ================================================================ */
describe("component config", () => {
  it("should annotate controller inside .component()", () => {
    expectAnnotation(
      'myMod.component("cmp", { controller: function(a) {} });',
      'myMod.component("cmp", { controller: ["a", function(a) {}] });',
    );
  });

  it("should annotate template and templateUrl inside .component()", () => {
    const input =
      'myMod.component("cmp", { template: function(b) {}, templateUrl: function(c) {} });';
    const result = annotate(input)!;
    expect(result).toContain('template: ["b", function(b) {}]');
    expect(result).toContain('templateUrl: ["c", function(c) {}]');
  });
});

/* ================================================================
 * angular.module config function
 * ================================================================ */
describe("angular.module config function", () => {
  it("should annotate the third argument of angular.module()", () => {
    expectAnnotation(
      'angular.module("MyMod", ["dep"], function($interpolateProvider) {});',
      'angular.module("MyMod", ["dep"], ["$interpolateProvider", function($interpolateProvider) {}]);',
    );
  });
});

/* ================================================================
 * Arrow functions
 * ================================================================ */
describe("arrow functions", () => {
  it("should annotate arrow functions in module methods", () => {
    expectAnnotation(
      'myMod.controller("MyCtrl", ($scope, $timeout) => {});',
      'myMod.controller("MyCtrl", ["$scope", "$timeout", ($scope, $timeout) => {}]);',
    );
  });

  it("should annotate arrow functions in .config()", () => {
    expectAnnotation(
      "myMod.config(($interpolateProvider) => {});",
      'myMod.config(["$interpolateProvider", ($interpolateProvider) => {}]);',
    );
  });
});

/* ================================================================
 * Reference following
 * ================================================================ */
describe("reference following", () => {
  it("should add $inject for named function references", () => {
    const input = [
      "function MyCtrl($scope, $timeout) {}",
      'angular.module("MyMod").controller("MyCtrl", MyCtrl);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MyCtrl.$inject = ["$scope", "$timeout"];');
  });

  it("should add $inject for variable function references", () => {
    const input = [
      "var MyCtrl = function($scope) {};",
      'angular.module("MyMod").controller("MyCtrl", MyCtrl);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MyCtrl.$inject = ["$scope"];');
  });

  it("should add $inject for references inside an IIFE-wrapped module", () => {
    const input = [
      "(function () {",
      "  'use strict';",
      "  angular.module('common.services').factory('domiciliationsService', domiciliationsService);",
      "  function domiciliationsService($q, $http) { return {}; }",
      "})();",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('domiciliationsService.$inject = ["$q", "$http"];');
  });

  it("should add $inject for references inside an arrow IIFE", () => {
    const input = [
      "(() => {",
      "  angular.module('m').service('Svc', Svc);",
      "  function Svc($q) {}",
      "})();",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('Svc.$inject = ["$q"];');
  });

  it("should add $inject for references inside a unary-prefixed IIFE", () => {
    const input = [
      "!function () {",
      "  angular.module('m').factory('foo', foo);",
      "  function foo($http) {}",
      "}();",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('foo.$inject = ["$http"];');
  });
});

/* ================================================================
 * ES6 classes
 * ================================================================ */
describe("ES6 classes", () => {
  it("should add $inject for class references used as services", () => {
    const input = [
      "class MySvc { constructor(dep1) { this.dep1 = dep1; } }",
      'angular.module("MyMod").service("MySvc", MySvc);',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('MySvc.$inject = ["dep1"];');
  });
});

/* ================================================================
 * Explicit @ngInject comment
 * ================================================================ */
describe("explicit @ngInject comment", () => {
  it("should annotate function with @ngInject comment", () => {
    const input = "/* @ngInject */\nfunction foo($scope) {}";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('foo.$inject = ["$scope"];');
  });

  it("should annotate inline function with @ngInject", () => {
    const input = "var x = /* @ngInject */ function($scope) {};";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('x.$inject = ["$scope"];');
  });

  it("should annotate function with @ngInject in single-line JSDoc comment", () => {
    const input = "/** @ngInject */\nfunction foo($scope) {}";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('foo.$inject = ["$scope"];');
  });

  it("should annotate function with @ngInject in multi-line JSDoc comment", () => {
    const input = [
      "/**",
      " * Some description",
      " * @param {object} aide",
      " * @ngInject",
      " */",
      "function hasRightToReadContributions(aide, contributionsService) {}",
    ].join("\n");
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain(
      'hasRightToReadContributions.$inject = ["aide", "contributionsService"];',
    );
  });
});

/* ================================================================
 * Explicit "ngInject" directive prologue
 * ================================================================ */
describe('"ngInject" directive prologue', () => {
  it('should annotate function with "ngInject" prologue', () => {
    const input = 'function Foo($scope) { "ngInject"; }';
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });

  it('should work alongside "use strict"', () => {
    const input = 'function Foo($scope) { "use strict"; "ngInject"; }';
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('Foo.$inject = ["$scope"];');
  });
});

/* ================================================================
 * @ngNoInject suppression
 * ================================================================ */
describe("@ngNoInject suppression", () => {
  it("should not annotate function with @ngNoInject comment", () => {
    const input = 'myMod.controller("MyCtrl", /* @ngNoInject */ function($scope) {});';
    const result = annotate(input);
    expect(result).toBeNull();
  });
});

/* ================================================================
 * $routeProvider
 * ================================================================ */
describe("$routeProvider.when", () => {
  it("should annotate controller and resolve in route config", () => {
    const input = [
      '$routeProvider.when("path", {',
      "  controller: function($scope) {},",
      "  resolve: {",
      "    more: function($scope, $timeout) {}",
      "  },",
      "  dontAlterMe: function(arg) {}",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
    expect(result).toContain('more: ["$scope", "$timeout", function($scope, $timeout) {}]');
    /* dontAlterMe should be left alone. */
    expect(result).toContain("dontAlterMe: function(arg) {}");
  });
});

/* ================================================================
 * $stateProvider
 * ================================================================ */
describe("$stateProvider.state", () => {
  it("should annotate controller and resolve in state config", () => {
    const input = [
      '$stateProvider.state("myState", {',
      "  resolve: { data: function($http) {} },",
      "  controller: function($scope) {},",
      "  onEnter: function($state) {},",
      "  onExit: function($state) {}",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('data: ["$http", function($http) {}]');
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
    expect(result).toContain('onEnter: ["$state", function($state) {}]');
    expect(result).toContain('onExit: ["$state", function($state) {}]');
  });

  it("should annotate nested views", () => {
    const input = [
      '$stateProvider.state("myState", {',
      "  views: {",
      "    main: {",
      "      controller: function($scope) {},",
      "      resolve: { data: function($http) {} }",
      "    }",
      "  }",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
    expect(result).toContain('data: ["$http", function($http) {}]');
  });
});

/* ================================================================
 * Modal / Dialog services
 * ================================================================ */
describe("modal and dialog services", () => {
  it("should annotate $modal.open() config", () => {
    const input = [
      "$modal.open({",
      "  controller: function($scope) {},",
      "  resolve: {",
      "    items: function(MyService) {}",
      "  },",
      "  donttouch: function(me) {}",
      "});",
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
    expect(result).toContain('items: ["MyService", function(MyService) {}]');
    expect(result).toContain("donttouch: function(me) {}");
  });

  it("should annotate $uibModal.open() config", () => {
    const input = "$uibModal.open({ controller: function($scope) {} });";
    const result = annotate(input)!;
    expect(result).toContain('controller: ["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * $injector.invoke
 * ================================================================ */
describe("$injector.invoke", () => {
  it("should annotate $injector.invoke() argument", () => {
    expectAnnotation(
      "$injector.invoke(function($compile) {});",
      '$injector.invoke(["$compile", function($compile) {}]);',
    );
  });
});

/* ================================================================
 * $httpProvider interceptors
 * ================================================================ */
describe("$httpProvider interceptors", () => {
  it("should annotate interceptors.push() arguments", () => {
    const input = "$httpProvider.interceptors.push(function($scope) {});";
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
  });
});

/* ================================================================
 * $controllerProvider.register
 * ================================================================ */
describe("$controllerProvider.register", () => {
  it("should annotate register() argument", () => {
    expectAnnotation(
      '$controllerProvider.register("foo", function($scope) {});',
      '$controllerProvider.register("foo", ["$scope", function($scope) {}]);',
    );
  });
});

/* ================================================================
 * Chaining
 * ================================================================ */
describe("chaining", () => {
  it("should annotate chained module method calls", () => {
    const input = [
      'angular.module("MyMod")',
      '  .controller("A", function($scope) {})',
      '  .factory("B", function($http) {});',
    ].join("\n");
    const result = annotate(input)!;
    expect(result).toContain('["$scope", function($scope) {}]');
    expect(result).toContain('["$http", function($http) {}]');
  });
});

/* ================================================================
 * explicitOnly mode
 * ================================================================ */
describe("explicitOnly mode", () => {
  it("should NOT annotate implicit patterns in explicitOnly mode", () => {
    const code = 'myMod.controller("MyCtrl", function($scope) {});';
    const result = annotate(code, { explicitOnly: true });
    expect(result).toBeNull();
  });

  it("should still annotate @ngInject in explicitOnly mode", () => {
    const input = "/* @ngInject */\nfunction foo($scope) {}";
    const result = annotate(input, { explicitOnly: true })!;
    expect(result).toContain('foo.$inject = ["$scope"];');
  });
});

/* ================================================================
 * Edge cases
 * ================================================================ */
describe("edge cases", () => {
  it("should return null when no annotations are needed", () => {
    const result = annotate("var x = 1;");
    expect(result).toBeNull();
  });

  it("should handle empty source", () => {
    const result = annotate("");
    expect(result).toBeNull();
  });

  it("should not double-annotate already-annotated code", () => {
    const input = 'myMod.controller("MyCtrl", ["$scope", function($scope) {}]);';
    const result = annotate(input);
    /* The function inside the array has params but the array itself
       is not a recognized pattern, so it should be left alone. */
    expect(result).toBeNull();
  });
});

/* ================================================================
 * False-positive guard — non-Angular calls with same method names
 * ================================================================ */
describe("false positive guard", () => {
  it("should not annotate _.filter(collection, fn) — first arg is not a string", () => {
    const input = "_.filter(dispositifs, function(dispositif) { return dispositif.active; });";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should not annotate _.map(array, fn) — first arg is not a string", () => {
    const input = "_.map(items, function(item) { return item.id; });";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should not annotate _.factory(obj, fn) — first arg is not a string", () => {
    const input = "_.factory(myObj, function(dep) { return dep; });";
    const result = annotate(input);
    expect(result).toBeNull();
  });

  it("should still annotate angular .filter('name', fn) — first arg IS a string", () => {
    const input = 'myMod.filter("myFilter", function($scope) { return function(input) {}; });';
    const result = annotate(input)!;
    expect(result).toContain('["$scope"');
  });

  it("should still annotate angular .service('name', fn) — first arg IS a string", () => {
    const input = 'myMod.service("MyService", function($http, $q) {});';
    const result = annotate(input)!;
    expect(result).toContain('["$http", "$q"');
  });
});

it("should not annotate a MODULE_METHODS_WITH_NAME call with more than 2 args", () => {
  // Angular never calls .filter/.controller/etc with 3 args; extra args = not Angular
  const input = 'someObj.filter("name", function(dep) {}, extraArg);';
  const result = annotate(input);
  expect(result).toBeNull();
});
