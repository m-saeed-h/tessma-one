module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Default Jest testMatch does NOT match `*.e2e-spec.ts` — the hyphen
  // before "spec" falls outside `?(*.)+(spec|test)`. Silently, so
  // `npm run test:e2e` / `test:rbac` reported "No tests found" (still a
  // failing exit code, but for the wrong reason, and coverage claims in the
  // README were false). Explicit patterns fix discovery for both naming
  // styles used in this repo.
  testMatch: ['**/test/**/*.spec.ts', '**/test/**/*.e2e-spec.ts'],
};
