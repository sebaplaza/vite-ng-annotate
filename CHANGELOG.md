# vite-ng-annotate

## 0.2.0

### Minor Changes

- [`fd4de6d`](https://github.com/sebaplaza/vite-ng-annotate/commit/fd4de6d945203ed690e42525b67cad54d83b6422) Thanks [@sebaplaza](https://github.com/sebaplaza)! - First version

### Patch Changes

- [`79a60ff`](https://github.com/sebaplaza/vite-ng-annotate/commit/79a60ffca90d8b93f6ea07d2e391f7ae2f8ea968) Thanks [@plaza-s-mgdis](https://github.com/plaza-s-mgdis)! - Fix `@ngInject` detection in JSDoc block comments. Previously, only single-line `/* @ngInject */` comments were recognised. Multi-line JSDoc comments (`/** @ngInject */` and `/**\n * @ngInject\n */`) are now handled correctly.

- [#1](https://github.com/sebaplaza/vite-ng-annotate/pull/1) [`fa25985`](https://github.com/sebaplaza/vite-ng-annotate/commit/fa2598556c0c37d0c7f042f60c037322afe5904f) Thanks [@sebaplaza](https://github.com/sebaplaza)! - Fix false-positive DI annotation on non-Angular calls sharing method names with Angular module methods.

  Previously, any call whose method name appeared in the DI list (`filter`, `factory`, `service`, etc.) was annotated regardless of the receiver. This caused lodash iteratees to be wrapped in annotation arrays — e.g. `_.filter(items, fn)` became `_.filter(items, ["fn", fn])`, which lodash interprets as a `matchesProperty` shorthand and silently returns `[]`.

  The fix requires that the first argument is a string literal (the Angular registration name) before annotating the second argument.

- [`a0191c5`](https://github.com/sebaplaza/vite-ng-annotate/commit/a0191c59b6724778217ef54b698844716a31717a) Thanks [@plaza-s-mgdis](https://github.com/plaza-s-mgdis)! - Resolve identifier references for declarations nested inside IIFE wrappers
  (`(function () { ... })()`, arrow IIFEs, and unary-prefixed forms). Previously
  `collectDeclarations` only walked the top level of the Program AST, so a
  historical AngularJS pattern like

  ```js
  (function () {
    "use strict";
    angular.module("m").factory("foo", foo);
    function foo($q, $http) {}
  })();
  ```

  left `foo` unannotated. Under minification this surfaced at runtime as
  `[$injector:strictdi]` because the parameter names were renamed.

- [`d07a408`](https://github.com/sebaplaza/vite-ng-annotate/commit/d07a4088ee2fa84117a2286ee5fe2e36fa91ba3f) Thanks [@sebaplaza](https://github.com/sebaplaza)! - first version
