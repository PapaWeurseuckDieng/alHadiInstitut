# Runtime Validation Report

**Generated**: 2026-10-07
**Target**: `C:\Users\SURFACE LAPTOP3\Downloads\Application-daara\alHadiInstitut`

## Summary

| Step | Status | Exit Code | Details |
|------|--------|-----------|---------|
| Backend feature tests | PASS | 0 | `php artisan test`: 31 tests, 196 assertions |
| Browser E2E | PASS | 0 | `npx playwright test`: 7 browser flows passed |
| Frontend lint and build | PASS | 0 | `npm run lint` and `npm run build` |
| API route registration | PASS | 0 | 24 routes registered under `/api/v1` |
| Diff formatting | PASS | 0 | `git diff --check` |

**Overall**: PASS

## Environment

- Docker daemon: available.
- Node.js: v24.19.0.
- Playwright: v1.63.0.
- Browser tests ran against a disposable Docker backend and isolated SQLite database; the application MySQL service was not used by the browser fixture.
- Playwright's temporary test container was removed after the run.

## Browser journeys exercised

- Unauthenticated access redirects to login.
- Admin lists, searches, and creates records using the live API.
- Tuteur access is restricted to attached children and cannot access the admin dashboard.
- Oustaz can access assigned classes and students.
- First login requires a password change, followed by a new login.
- Mobile navigation and form layout remain usable without horizontal overflow.
- Network failure is shown to the user and can be retried.

## Test assets

Existing Laravel feature suites and Playwright journeys were reused. The end-to-end first-login validation uses a mismatched confirmation so the API's validation error is exercised; it does not assume password-complexity requirements.

## Known coverage gap

Tests used SQLite in isolated environments; behavior against the configured MySQL database was not exercised in this run.
