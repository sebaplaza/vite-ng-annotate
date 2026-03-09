# ⚡ vite-ng-annotate

Vite plugin that automatically adds AngularJS dependency injection annotations to your source code. Ensures your AngularJS app survives minification by converting function parameters into explicit string-based annotations. 🛡️

Inspired by [babel-plugin-angularjs-annotate](https://github.com/schmod/babel-plugin-angularjs-annotate) and [ng-annotate](https://github.com/olov/ng-annotate).

## 📦 Install

```bash
npm install vite-ng-annotate --save-dev
```

## 🚀 Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import ngAnnotate from "vite-ng-annotate";

export default defineConfig({
  plugins: [ngAnnotate()],
});
```

### 🔒 Explicit-only mode

Only annotate functions marked with `/* @ngInject */` or `"ngInject"`:

```ts
export default defineConfig({
  plugins: [ngAnnotate({ explicitOnly: true })],
});
```

## 🔍 What it does

### ❌ Before (breaks when minified)

```js
angular.module("MyApp")
  .controller("MyCtrl", function ($scope, $timeout) {
    // $scope and $timeout get renamed by minifier
  });
```

### ✅ After (minification-safe)

```js
angular.module("MyApp")
  .controller("MyCtrl", ["$scope", "$timeout", function ($scope, $timeout) {
    // String annotations survive minification
  }]);
```

## 🧩 Supported patterns

### 🏗️ Module methods (implicit)

All standard AngularJS module methods are detected automatically:

```js
// Inline array annotation is added to the function argument
myMod.controller("Ctrl", function ($scope, $timeout) {});
myMod.service("Svc", function ($http) {});
myMod.factory("Fact", function ($q, $http) {});
myMod.filter("myFilter", function ($sce) {});
myMod.directive("myDir", function ($compile) {});
myMod.animation("myAnim", function ($animate) {});
myMod.decorator("myDec", function ($delegate) {});

// .config() and .run() (no name argument)
myMod.config(function ($interpolateProvider) {});
myMod.run(function ($rootScope) {});
```

### 🔧 Provider with `$get`

```js
myMod.provider("foo", function (x) {
  this.$get = function (a, b) {}; // annotated
  // Also detects self.$get, that.$get, and return { $get: fn }
});

// Object-form provider
myMod.provider("foo", { $get: function ($scope) {} });
```

### 🧱 Component config

```js
myMod.component("cmp", {
  controller: function (a) {},   // annotated
  template: function (b) {},     // annotated
  templateUrl: function (c) {},  // annotated
});
```

### 📐 `angular.module()` config function

```js
angular.module("MyMod", ["dep"], function ($interpolateProvider) {});
```

### ➡️ Arrow functions

All patterns work with arrow functions:

```js
myMod.controller("Ctrl", ($scope, $timeout) => {});
myMod.config(($interpolateProvider) => {});
```

### 🔗 Reference following

Named functions and variables passed by reference get `$inject` added:

```js
function MyCtrl($scope, $timeout) {}
angular.module("MyMod").controller("MyCtrl", MyCtrl);
// Produces: MyCtrl.$inject = ["$scope", "$timeout"];
```

### 🏛️ ES6 classes

```js
class MySvc {
  constructor(dep1) {
    this.dep1 = dep1;
  }
}
angular.module("MyMod").service("MySvc", MySvc);
// Produces: MySvc.$inject = ["dep1"];
```

### 🗺️ `$routeProvider.when()`

```js
$routeProvider.when("path", {
  controller: function ($scope) {},        // annotated
  resolve: {
    data: function ($http) {},             // annotated
  },
  dontAlterMe: function (arg) {},          // NOT annotated
});
```

### 🧭 `$stateProvider.state()` (UI-Router)

```js
$stateProvider.state("myState", {
  controller: function ($scope) {},         // annotated
  controllerProvider: function ($state) {}, // annotated
  templateProvider: function ($timeout) {}, // annotated
  onEnter: function ($state) {},            // annotated
  onExit: function ($state) {},             // annotated
  resolve: {
    data: function ($http) {},              // annotated
  },
  views: {
    main: {
      controller: function ($scope) {},     // annotated (nested)
    },
  },
});
```

### 💬 Modal and dialog services

```js
$modal.open({
  controller: function ($scope) {},          // annotated
  resolve: { items: function (Svc) {} },     // annotated
});

// Also: $uibModal.open(), $mdDialog.show(), $mdToast.show(), $mdBottomSheet.show()
```

### 💉 `$injector.invoke()`

```js
$injector.invoke(function ($compile) {}); // annotated
```

### 🌐 `$httpProvider` interceptors

```js
$httpProvider.interceptors.push(function ($q) {});            // annotated
$httpProvider.responseInterceptors.push(function ($scope) {}); // annotated
```

### 📋 `$controllerProvider.register()`

```js
$controllerProvider.register("foo", function ($scope) {}); // annotated
```

### 🏭 `$provide` methods

```js
$provide.service("foo", function ($scope) {});   // annotated
$provide.factory("foo", function ($scope) {});   // annotated
$provide.decorator("foo", function ($scope) {}); // annotated
$provide.provider("foo", function ($scope) {
  this.$get = function ($http) {};               // annotated
});
```

### ⛓️ Chaining

All patterns work through method chains:

```js
angular.module("MyMod")
  .controller("A", function ($scope) {})
  .factory("B", function ($http) {})
  .config(function ($interpolateProvider) {});
```

## 🏷️ Explicit annotation markers

### 💬 `/* @ngInject */` comment

Place before a function, class, object, or property:

```js
// Named function declaration -> $inject
/* @ngInject */
function MyCtrl($scope) {}
// Result: MyCtrl.$inject = ["$scope"];

// Variable assignment -> $inject
var x = /* @ngInject */ function ($scope) {};
// Result: x.$inject = ["$scope"];

// Object literal -> annotate all function values
var resolves = /* @ngInject */ {
  foo: function (a) {},
  bar: function (b, c) {},
};

// Single property
var obj = { /* @ngInject */ foo: function (a) {} };

// Class
/* @ngInject */
class Svc { constructor(dep1) {} }
// Result: Svc.$inject = ["dep1"];
```

### 📜 `"ngInject"` directive prologue

Place as the first statement in a function body:

```js
function Foo($scope) {
  "ngInject";
}
// Result: Foo.$inject = ["$scope"];

// Works in class constructors too
class Svc {
  constructor(dep1) {
    "ngInject";
  }
}
// Result: Svc.$inject = ["dep1"];
```

### 🚫 `/* @ngNoInject */` suppression

Prevent annotation for a specific function:

```js
myMod.controller("Ctrl", /* @ngNoInject */ function ($scope) {});
// NOT annotated

function foo($scope) {
  "ngNoInject";
}
// NOT annotated even if referenced
```

## ⚙️ Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `explicitOnly` | `boolean` | `false` | Only annotate functions with explicit `@ngInject` or `"ngInject"` markers |
| `include` | `string[]` | `[".js", ".ts", ".mjs", ".cjs"]` | File extensions to process |
| `exclude` | `string[]` | `[".spec.js", ".spec.ts", ".test.js", ".test.ts"]` | File extensions to exclude |

## 🧪 Programmatic API

The annotation engine can be used directly without the Vite plugin:

```ts
import { annotate } from "vite-ng-annotate";

const result = annotate('myMod.controller("Ctrl", function($scope) {});');
// 'myMod.controller("Ctrl", ["$scope", function($scope) {}]);'
```

## 🛠️ Development

```bash
pnpm install
pnpm test          # 🧪 Run tests
pnpm run coverage  # 📊 Run tests with coverage
pnpm run lint      # 🔍 Lint with oxlint
pnpm run format    # 🎨 Format with oxfmt
pnpm run build     # 📦 Build with tsc
```

### 🪝 Git hooks

[Husky](https://typicode.github.io/husky/) runs the following hooks automatically:

- **pre-commit** — lint and format staged files via [lint-staged](https://github.com/lint-staged/lint-staged) (oxlint + oxfmt)
- **commit-msg** — validate commit messages with [commitlint](https://commitlint.js.org/) using [Conventional Commits](https://www.conventionalcommits.org/)

```
feat: add new annotation pattern     ✅
fix: handle edge case in parser      ✅
updated stuff                        ❌
```

## 🚢 Versioning & Release

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

```bash
pnpm changeset           # 📝 Create a new changeset
pnpm version             # 🔖 Bump versions from pending changesets
pnpm release             # 🚀 Build and publish to npm
```

### Workflow

1. Make your changes and create a changeset with `pnpm changeset`
2. Select the semver bump type (patch / minor / major) and describe the change
3. Commit the changeset file along with your changes
4. When merged to `main`, the CI will open a **Version Packages** PR
5. Merging that PR triggers an automated publish to npm

## 📄 License

MIT
