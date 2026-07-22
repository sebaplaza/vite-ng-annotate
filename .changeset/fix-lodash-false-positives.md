---
"vite-ng-annotate": patch
---

Fix false-positive DI annotation on non-Angular calls sharing method names with Angular module methods.

Previously, any call whose method name appeared in the DI list (`filter`, `factory`, `service`, etc.) was annotated regardless of the receiver. This caused lodash iteratees to be wrapped in annotation arrays — e.g. `_.filter(items, fn)` became `_.filter(items, ["fn", fn])`, which lodash interprets as a `matchesProperty` shorthand and silently returns `[]`.

The fix requires that the first argument is a string literal (the Angular registration name) before annotating the second argument.
