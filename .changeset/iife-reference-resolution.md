---
"vite-ng-annotate": patch
---

Resolve identifier references for declarations nested inside IIFE wrappers
(`(function () { ... })()`, arrow IIFEs, and unary-prefixed forms). Previously
`collectDeclarations` only walked the top level of the Program AST, so a
historical AngularJS pattern like

```js
(function () {
  'use strict';
  angular.module('m').factory('foo', foo);
  function foo($q, $http) {}
})();
```

left `foo` unannotated. Under minification this surfaced at runtime as
`[$injector:strictdi]` because the parameter names were renamed.
