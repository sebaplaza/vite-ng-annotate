import { describe, expect, it } from "vitest";
import ngAnnotatePlugin from "../src/index.js";

describe("vite plugin", () => {
  it("should return a plugin with the correct name", () => {
    const plugin = ngAnnotatePlugin();
    expect(plugin.name).toBe("vite-ng-annotate");
  });

  it("should enforce pre ordering", () => {
    const plugin = ngAnnotatePlugin();
    expect(plugin.enforce).toBe("pre");
  });

  it("should have a transform function", () => {
    const plugin = ngAnnotatePlugin();
    expect(typeof plugin.transform).toBe("function");
  });

  it("should transform .js files with Angular code", () => {
    const plugin = ngAnnotatePlugin();
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | undefined;

    const result = transform('myMod.controller("MyCtrl", function($scope) {});', "app.js");
    expect(result).toBeDefined();
    expect(result!.code).toContain('["$scope", function($scope) {}]');
  });

  it("should skip non-matching file extensions", () => {
    const plugin = ngAnnotatePlugin();
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | undefined;

    const result = transform('myMod.controller("MyCtrl", function($scope) {});', "styles.css");
    expect(result).toBeUndefined();
  });

  it("should skip test files by default", () => {
    const plugin = ngAnnotatePlugin();
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | undefined;

    const result = transform('myMod.controller("MyCtrl", function($scope) {});', "app.spec.js");
    expect(result).toBeUndefined();
  });

  it("should skip files without Angular patterns", () => {
    const plugin = ngAnnotatePlugin();
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | undefined;

    const result = transform("var x = 1 + 2;", "app.js");
    expect(result).toBeUndefined();
  });

  it("should respect custom include/exclude options", () => {
    const plugin = ngAnnotatePlugin({
      include: [".jsx"],
      exclude: [],
    });
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | undefined;

    const result = transform('myMod.controller("MyCtrl", function($scope) {});', "app.jsx");
    expect(result).toBeDefined();
  });

  it("should pass explicitOnly option through", () => {
    const plugin = ngAnnotatePlugin({ explicitOnly: true });
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | undefined;

    /* Implicit pattern should not be annotated. */
    const result = transform('myMod.controller("MyCtrl", function($scope) {});', "app.js");
    expect(result).toBeUndefined();
  });
});
