# Maintenance CI update — 28 October 2026

## Changes

Updated Next.js, Zod, Vitest and affected dependencies to address the security findings reported by CI. Updated the form resolver and backend test configuration to work with the newer versions.

Pinned pnpm to 10.34.9 so local development and CI use the same version. The workflow checks lint, TypeScript, tests, production builds and dependency security.

The maintenance features and Firestore rules have not changed.

## Checks completed

The following checks passed locally:

- Dependency installation using the frozen lockfile.
- Placeholder validation, lint and TypeScript checks.
- 23 frontend tests and 5 backend tests.
- Frontend and backend production builds.
- Dependency audit with no high or critical findings.

## Remaining issue

One moderate UUID finding remains in Firebase Admin’s dependency chain. It requires a compatible dependency upgrade and has not been suppressed.

The existing CI command, `pnpm audit --audit-level=high`, passes. Running `pnpm audit` without that threshold still reports the moderate finding.

## Running CI

Automatic CI triggering still needs to be confirmed. A manual run can be started with:

```bash
gh workflow run ci.yml \
  --repo arnavsharma569-creator/hd-pendant-maintenance \
  --ref feature/maintenance-requests
```

After installing the updated dependencies, check sign-in, request creation, status updates and history in the app. Confirm the GitHub CI results before merging.