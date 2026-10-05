/** @type {import('dependency-cruiser').IConfiguration} */
// Note: dependency-cruiser does not parse .astro files, so their imports are missing from the graph.
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "warn", from: {}, to: { circular: true } },
    {
      name: "lib-not-upstream",
      comment: "src/lib must not import components or pages",
      severity: "error",
      from: { path: "^src/lib" },
      to: { path: "^src/(components|pages)" },
    },
    {
      name: "components-not-pages",
      comment: "React islands must not import pages or API routes",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: "^src/pages" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(dist|\\.astro|playwright-report|test-results|reports|context|public)" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
