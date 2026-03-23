---
"vite-ng-annotate": patch
---

Fix `@ngInject` detection in JSDoc block comments. Previously, only single-line `/* @ngInject */` comments were recognised. Multi-line JSDoc comments (`/** @ngInject */` and `/**\n * @ngInject\n */`) are now handled correctly.
