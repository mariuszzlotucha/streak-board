# Runtime probe results (verify)

```json
{
  "run": "verify",
  "node": "v24.21.0",
  "nodeRequired": "22.14.0",
  "startedAt": "2026-10-02T19:49:25.303Z",
  "base": "http://127.0.0.1:4399",
  "stub": "http://127.0.0.1:54399",
  "gitHead": "328ca00",
  "gitStatus": ["M src/middleware.ts", "?? probe/", "?? src/pages/api/probe.ts", "?? src/pages/probe-stream.astro"],
  "versions": {
    "astro": "7.3.2",
    "@astrojs/cloudflare": "14.3.1",
    "@supabase/supabase-js": "2.116.0",
    "@supabase/ssr": "0.12.7",
    "@supabase/postgrest-js": "2.116.0",
    "@supabase/auth-js": "2.116.0",
    "wrangler": "4.131.1",
    "miniflare": "5.20260911.0-alpha",
    "workerd": "1.20260911.1"
  },
  "finishedAt": "2026-10-02T19:54:24.499Z"
}
```

| id             | request                                                                     | HTTP                                                   | Location                          | Set-Cookie                                       | alert                                                                                                                  | console lines | stub calls |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| C0a            | POST /api/tasks/checkoff (Accept JSON)                                      | 200 (41 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 3          |
| C0b            | POST /api/tasks/uncheck (Accept JSON)                                       | 200 (32 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 3          |
| C0c            | GET /dashboard                                                              | 200 (71 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 6          |
| J0             | POST /api/groups/join                                                       | 302 (54 ms)                                            | /dashboard                        | join_code (cleared)                              | no                                                                                                                     | 1             | 2          |
| C1a            | POST /api/tasks/checkoff (Accept JSON)                                      | 503 (29 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C1b            | GET /dashboard                                                              | 503 (25 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C1c            | POST /api/tasks/checkoff                                                    | 503 (25 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C1d            | POST /api/tasks/checkoff (Accept JSON)                                      | 503 (35 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C1e            | POST /api/tasks/checkoff (Accept JSON)                                      | 503 (27 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C1f            | POST /api/tasks/checkoff (Accept JSON)                                      | 302 (27 ms)                                            | /auth/signin                      |                                                  | no                                                                                                                     | 1             | 1          |
| C2a            | POST /api/tasks/checkoff (Accept JSON)                                      | 503 (20 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C2e            | GET /dashboard                                                              | 503 (16 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C2c            | POST /api/tasks/checkoff (Accept JSON)                                      | 503 (25 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 0          |
| C2d            | GET /dashboard                                                              | 503 (29 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 0          |
| C2b            | POST /api/tasks/checkoff (Accept JSON)                                      | 200 (12048 ms)                                         |                                   |                                                  | no                                                                                                                     | 1             | 3          |
| C2h            | POST /api/tasks/checkoff (Accept JSON)                                      | TimeoutError: The operation was aborted due to timeout |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| C4             | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (21 ms)                                            |                                   |                                                  | no                                                                                                                     | 10            | 3          |
| C5             | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (20 ms)                                            |                                   |                                                  | no                                                                                                                     | 13            | 3          |
| C6             | POST /api/tasks/checkoff (Accept JSON)                                      | 403 (35 ms)                                            |                                   |                                                  | no                                                                                                                     | 12            | 3          |
| C6b            | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (29 ms)                                            |                                   |                                                  | no                                                                                                                     | 10            | 3          |
| C7             | POST /api/tasks/checkoff (Accept JSON)                                      | 403 (26 ms)                                            |                                   |                                                  | no                                                                                                                     | 7             | 3          |
| C7b            | POST /api/tasks/checkoff (Accept JSON)                                      | 200 (25 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 3          |
| C9             | POST /api/tasks/uncheck (Accept JSON)                                       | 200 (34 ms)                                            |                                   |                                                  | no                                                                                                                     | 7             | 3          |
| C10            | POST /api/tasks/uncheck (Accept JSON)                                       | 500 (35 ms)                                            |                                   |                                                  | no                                                                                                                     | 10            | 3          |
| C10b           | POST /api/tasks/uncheck (Accept JSON)                                       | 500 (19 ms)                                            |                                   |                                                  | no                                                                                                                     | 13            | 3          |
| J1             | POST /api/groups/join                                                       | 302 (37 ms)                                            | /dashboard?error=unknown          |                                                  | no                                                                                                                     | 12            | 2          |
| J2             | POST /api/groups/join                                                       | 302 (28 ms)                                            | /dashboard?error=unknown          |                                                  | no                                                                                                                     | 15            | 2          |
| J3             | POST /api/groups/join                                                       | 302 (43 ms)                                            | /dashboard?error=invalid_code     | join_code (cleared)                              | no                                                                                                                     | 1             | 2          |
| J3b            | POST /api/groups/join                                                       | 302 (28 ms)                                            | /dashboard?error=invalid_code     | join_code (cleared)                              | no                                                                                                                     | 1             | 1          |
| J4             | POST /api/groups/join                                                       | 302 (32 ms)                                            | /dashboard?error=already_in_group | join_code (cleared)                              | no                                                                                                                     | 1             | 2          |
| J5             | POST /api/groups/join                                                       | 302 (33 ms)                                            | /dashboard?error=forbidden        |                                                  | no                                                                                                                     | 15            | 2          |
| J6a            | GET /join/zzz                                                               | 302 (40 ms)                                            | /dashboard                        |                                                  | no                                                                                                                     | 1             | 1          |
| J6b            | GET /join/abc123def456                                                      | 302 (49 ms)                                            | /dashboard                        | join_code (set)                                  | no                                                                                                                     | 1             | 1          |
| J6c            | GET /join/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | 302 (43 ms)                                            | /dashboard                        |                                                  | no                                                                                                                     | 1             | 1          |
| J6d            | GET /join/abc123def456                                                      | 302 (21 ms)                                            | /dashboard                        | join_code (set)                                  | no                                                                                                                     | 1             | 0          |
| P1             | GET /api/probe?mode=throw                                                   | 500 (38 ms)                                            |                                   |                                                  | no                                                                                                                     | 20            | 0          |
| P1b            | GET /api/probe?mode=throw-cause                                             | 500 (42 ms)                                            |                                   |                                                  | no                                                                                                                     | 20            | 0          |
| P1c            | GET /api/probe?mode=throw-plain                                             | 500 (60 ms)                                            |                                   |                                                  | no                                                                                                                     | 10            | 0          |
| P5a            | GET /                                                                       | 500 (35 ms)                                            |                                   |                                                  | no                                                                                                                     | 12            | 0          |
| P5b            | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (49 ms)                                            |                                   |                                                  | no                                                                                                                     | 12            | 0          |
| P9a            | GET /api/probe?mode=log-error                                               | 200 (21 ms)                                            |                                   |                                                  | no                                                                                                                     | 10            | 0          |
| P9b            | GET /api/probe?mode=log-plain                                               | 200 (32 ms)                                            |                                   |                                                  | no                                                                                                                     | 2             | 0          |
| P9c            | GET /api/probe?mode=log-string                                              | 200 (44 ms)                                            |                                   |                                                  | no                                                                                                                     | 2             | 0          |
| P9d            | GET /api/probe?mode=log-error-only                                          | 200 (33 ms)                                            |                                   |                                                  | no                                                                                                                     | 5             | 0          |
| P9e            | GET /api/probe?mode=log-json                                                | 200 (27 ms)                                            |                                   |                                                  | no                                                                                                                     | 2             | 0          |
| C3a            | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (24 ms)                                            |                                   |                                                  | no                                                                                                                     | 9             | 2          |
| C3b            | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (7090 ms)                                          |                                   |                                                  | no                                                                                                                     | 13            | 5          |
| C3c            | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (7068 ms)                                          |                                   |                                                  | no                                                                                                                     | 12            | 5          |
| C3d            | POST /api/tasks/uncheck (Accept JSON)                                       | 500 (25 ms)                                            |                                   |                                                  | no                                                                                                                     | 9             | 2          |
| C3e            | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (24 ms)                                            |                                   |                                                  | no                                                                                                                     | 11            | 2          |
| C8             | POST /api/tasks/checkoff (Accept JSON)                                      | 404 (18 ms)                                            |                                   |                                                  | no                                                                                                                     | 9             | 2          |
| C8b            | POST /api/tasks/uncheck (Accept JSON)                                       | 404 (17 ms)                                            |                                   |                                                  | no                                                                                                                     | 9             | 2          |
| C11a           | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (22 ms)                                            |                                   |                                                  | no                                                                                                                     | 23            | 1          |
| C11b           | POST /api/tasks/uncheck (Accept JSON)                                       | 500 (22 ms)                                            |                                   |                                                  | no                                                                                                                     | 23            | 1          |
| C12a           | POST /api/tasks/checkoff                                                    | 302 (52 ms)                                            | /dashboard                        |                                                  | no                                                                                                                     | 1             | 3          |
| C12b           | POST /api/tasks/checkoff                                                    | 302 (30 ms)                                            | /dashboard?error=unknown          |                                                  | no                                                                                                                     | 10            | 3          |
| C12c           | POST /api/tasks/checkoff                                                    | 302 (39 ms)                                            | /dashboard?error=forbidden        |                                                  | no                                                                                                                     | 12            | 3          |
| C12d           | POST /api/tasks/checkoff                                                    | 302 (35 ms)                                            | /dashboard                        |                                                  | no                                                                                                                     | 9             | 2          |
| C12e           | POST /api/tasks/uncheck                                                     | 302 (55 ms)                                            | /dashboard?error=unknown          |                                                  | no                                                                                                                     | 10            | 3          |
| C13a           | GET /dashboard                                                              | 200 (42 ms)                                            |                                   |                                                  | yes: Something went wrong. Please try again.                                                                           | 7             | 6          |
| C13b           | GET /dashboard                                                              | 200 (46 ms)                                            |                                   |                                                  | yes: Something went wrong. Please try again.                                                                           | 7             | 6          |
| C13c           | GET /dashboard                                                              | 200 (44 ms)                                            |                                   |                                                  | no                                                                                                                     | 7             | 6          |
| C13d           | GET /dashboard                                                              | 200 (43 ms)                                            |                                   |                                                  | no                                                                                                                     | 7             | 6          |
| C13e           | GET /dashboard                                                              | 200 (24 ms)                                            |                                   |                                                  | yes: Something went wrong. Please try again.                                                                           | 7             | 2          |
| C13f           | GET /dashboard                                                              | 200 (7084 ms)                                          |                                   |                                                  | yes: Something went wrong. Please try again.                                                                           | 7             | 5          |
| J7a            | GET /dashboard                                                              | 200 (35 ms)                                            |                                   |                                                  | yes: Something went wrong. Please try again.                                                                           | 7             | 3          |
| J7b            | GET /dashboard                                                              | 200 (41 ms)                                            |                                   |                                                  | yes: Something went wrong. Please try again.                                                                           | 7             | 2          |
| J7c            | GET /dashboard                                                              | 200 (45 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 3          |
| J7d            | GET /dashboard                                                              | 200 (31 ms)                                            |                                   | join_code (cleared)                              | yes: This invite link or code is not valid.                                                                            | 1             | 3          |
| J8a            | POST /api/groups/join                                                       | 503 (22 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| J8b            | GET /dashboard                                                              | 503 (40 ms)                                            |                                   |                                                  | no                                                                                                                     | 24            | 1          |
| J9             | POST /api/groups/join                                                       | 302 (35 ms)                                            | /dashboard?error=unknown          |                                                  | no                                                                                                                     | 23            | 1          |
| P4             | GET /api/probe?mode=return500                                               | 500 (21 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 0          |
| P7             | GET /api/probe?mode=reject                                                  | 200 (20 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 0          |
| P8             | GET /api/probe?mode=waituntil-fail                                          | 200 (39 ms)                                            |                                   |                                                  | no                                                                                                                     | 2             | 0          |
| P10            | GET /probe-stream                                                           | 200 (168 ms)                                           |                                   |                                                  | no                                                                                                                     | 3             | 0          |
| P3a            | POST /api/auth/signout                                                      | 302 (32 ms)                                            | /                                 | sb-127-auth-token (cleared), join_code (cleared) | no                                                                                                                     | 24            | 2          |
| P3b            | POST /api/auth/signout                                                      | 302 (44 ms)                                            | /                                 | sb-127-auth-token (cleared), join_code (cleared) | no                                                                                                                     | 24            | 2          |
| P3c            | POST /api/auth/signout                                                      | 302 (32 ms)                                            | /                                 | sb-127-auth-token (cleared), join_code (cleared) | no                                                                                                                     | 1             | 2          |
| P13a           | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (44 ms)                                            |                                   | sb-127-auth-token (cleared)                      | no                                                                                                                     | 29            | 4          |
| P13b           | POST /api/groups/join                                                       | 302 (59 ms)                                            | /dashboard?error=forbidden        | sb-127-auth-token (cleared)                      | no                                                                                                                     | 35            | 4          |
| P13c           | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (25575 ms)                                         |                                   | sb-127-auth-token (set)                          | no                                                                                                                     | 29            | 11         |
| P13d           | POST /api/tasks/checkoff (Accept JSON)                                      | 200 (33 ms)                                            |                                   | sb-127-auth-token (set)                          | no                                                                                                                     | 1             | 5          |
| P13e           | POST /api/tasks/checkoff (Accept JSON)                                      | 302 (55 ms)                                            | /auth/signin                      | sb-127-auth-token (cleared)                      | no                                                                                                                     | 21            | 1          |
| P13f           | GET /dashboard                                                              | 200 (45 ms)                                            |                                   | sb-127-auth-token (cleared)                      | yes: Something went wrong. Please try again.                                                                           | 27            | 4          |
| P12a-unset     | GET /api/probe?mode=env                                                     | 200 (15 ms)                                            |                                   |                                                  | no                                                                                                                     | 1             | 0          |
| P12b-unset     | GET /                                                                       | 200 (28 ms)                                            |                                   |                                                  | yes: Uwaga: Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone. Zobacz instrukcję konfiguracji . | 1             | 0          |
| P12c-unset     | GET /auth/signin                                                            | 200 (44 ms)                                            |                                   | auth_email (cleared)                             | yes: Uwaga: Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone. Zobacz instrukcję konfiguracji . | 1             | 0          |
| P12d-unset     | GET /dashboard                                                              | 302 (37 ms)                                            | /auth/signin                      |                                                  | no                                                                                                                     | 1             | 0          |
| P12e-unset     | POST /api/tasks/checkoff (Accept JSON)                                      | 302 (33 ms)                                            | /auth/signin                      |                                                  | no                                                                                                                     | 1             | 0          |
| P12f-unset     | POST /api/groups/join                                                       | 302 (20 ms)                                            | /auth/signin                      |                                                  | no                                                                                                                     | 1             | 0          |
| P12a-malformed | GET /api/probe?mode=env                                                     | 500 (61 ms)                                            |                                   |                                                  | no                                                                                                                     | 34            | 0          |
| P12b-malformed | GET /                                                                       | 500 (44 ms)                                            |                                   |                                                  | no                                                                                                                     | 34            | 0          |
| P12c-malformed | GET /auth/signin                                                            | 500 (49 ms)                                            |                                   |                                                  | no                                                                                                                     | 34            | 0          |
| P12d-malformed | GET /dashboard                                                              | 500 (34 ms)                                            |                                   |                                                  | no                                                                                                                     | 34            | 0          |
| P12e-malformed | POST /api/tasks/checkoff (Accept JSON)                                      | 500 (47 ms)                                            |                                   |                                                  | no                                                                                                                     | 34            | 0          |
| P12f-malformed | POST /api/groups/join                                                       | 500 (39 ms)                                            |                                   |                                                  | no                                                                                                                     | 34            | 0          |

## C0a: control: check-off happy path (JSON)

- shape: no failure
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok)
- response: 200 [application/json] 41 ms, 33 bytes
- body: "{\"ok\":true,\"period\":\"2026-10-02\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 201 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 200 OK (29ms)
  ```

## C0b: control: uncheck happy path (JSON)

- shape: no failure
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok)
- response: 200 [application/json] 32 ms, 33 bytes
- body: "{\"ok\":true,\"period\":\"2026-10-02\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - DELETE /rest/v1/task_checkoffs?task_id=eq.33333333-3333-4333-8333-333333333333&user_id=eq.11111111-1... -> 200 (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/uncheck 200 OK (25ms)
  ```

## C0c: control: dashboard happy path

- shape: no failure
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/html] 71 ms, 33792 bytes
- html: title="Dashboard" headings=["Probe Crew","Members","Tasks","Leaderboard","Rename group","Delete group"] role=alert=false alerts=[] notes=["Mark done"]
- body: "Dashboard Your group Probe Crew Share this invite link to add people to your group. Copy Members 1 member probe@example.test Owner You Tasks 1 task Probe Task Edit Daily Delete Participants: probe@exa"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 (1 ms) bearer=user-jwt
  - POST /rest/v1/rpc/list_group_members -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&group_id=eq.22222222-2222... -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/task_participants?select=task_id%2Cuser_id&order=joined_at.asc%2Cuser_id.asc -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/task_checkoff_periods?select=task_id%2Cuser_id%2Cperiods -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /dashboard 200 OK (65ms)
  ```

## J0: control: join with valid code

- shape: no failure
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: (all ok)
- response: 302 -> /dashboard [] 54 ms, 0 bytes
- Set-Cookie names: join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/join_group -> 200 (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/groups/join 302 Found (46ms)
  ```

## C1a: Auth 503 JSON on getUser, check-off (JSON mode)

- shape: auth outage: getUser returns {error}, middleware discards it
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"status","status":503,"body":{"code":503,"error_code":"unexpected_failure","msg":"Service Unavailable"}}}
- response: 503 [application/json] 29 ms, 34 bytes
- body: "{\"ok\":false,\"error\":\"unavailable\"}"
- stub saw:
  - GET /auth/v1/user -> 503 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Service Unavailable',
  [stderr]     stack: 'AuthRetryableFetchError: Service Unavailable\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 503
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (23ms)
  ```

## C1b: Auth 503 JSON on getUser, GET /dashboard

- shape: auth outage
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"auth_user":{"mode":"status","status":503,"body":{"code":503,"error_code":"unexpected_failure","msg":"Service Unavailable"}}}
- response: 503 [text/html; charset=utf-8] 25 ms, 332 bytes
- html: title="Service unavailable" headings=["Service unavailable"] role=alert=false alerts=[] notes=[]
- body: "Service unavailable Service unavailable Sign-in is temporarily unavailable. Please try again in a moment."
- stub saw:
  - GET /auth/v1/user -> 503 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/dashboard',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Service Unavailable',
  [stderr]     stack: 'AuthRetryableFetchError: Service Unavailable\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 503
  [stderr]   }
  [stderr] }
  [stdout] GET /dashboard 503 Service Unavailable (19ms)
  ```

## C1c: Auth 503 JSON on getUser, plain form POST (no Accept JSON)

- shape: auth outage
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=-; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"status","status":503,"body":{"code":503,"error_code":"unexpected_failure","msg":"Service Unavailable"}}}
- response: 503 [text/html; charset=utf-8] 25 ms, 332 bytes
- html: title="Service unavailable" headings=["Service unavailable"] role=alert=false alerts=[] notes=[]
- body: "Service unavailable Service unavailable Sign-in is temporarily unavailable. Please try again in a moment."
- stub saw:
  - GET /auth/v1/user -> 503 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Service Unavailable',
  [stderr]     stack: 'AuthRetryableFetchError: Service Unavailable\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 503
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (18ms)
  ```

## C1d: Auth 502 HTML (gateway) on getUser, check-off (JSON)

- shape: auth outage, non-JSON body
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"status","status":502,"contentType":"text/html; charset=utf-8","body":"<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>"}}
- response: 503 [application/json] 35 ms, 34 bytes
- body: "{\"ok\":false,\"error\":\"unavailable\"}"
- stub saw:
  - GET /auth/v1/user -> 502 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Bad Gateway',
  [stderr]     stack: 'AuthRetryableFetchError: Bad Gateway\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12976:57)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 502
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (26ms)
  ```

## C1e: Auth 500 JSON on getUser, check-off (JSON)

- shape: auth internal error
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"status","status":500,"body":{"code":500,"error_code":"unexpected_failure","msg":"Database error querying schema"}}}
- response: 503 [application/json] 27 ms, 34 bytes
- body: "{\"ok\":false,\"error\":\"unavailable\"}"
- stub saw:
  - GET /auth/v1/user -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Database error querying schema',
  [stderr]     stack: 'AuthRetryableFetchError: Database error querying schema\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 500
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (19ms)
  ```

## C1f: Auth 401 bad_jwt on getUser (genuinely invalid session), check-off (JSON)

- shape: control: real sign-out looks identical to an outage
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"status","status":401,"body":{"code":401,"error_code":"bad_jwt","msg":"invalid JWT: unable to parse or verify signature"}}}
- response: 302 -> /auth/signin [] 27 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 401 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 302 Found (21ms)
  ```

## C2a: Auth connection reset on getUser, check-off (JSON)

- shape: auth unreachable (RST)
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"reset"}}
- response: 503 [application/json] 20 ms, 34 bytes
- body: "{\"ok\":false,\"error\":\"unavailable\"}"
- stub saw:
  - GET /auth/v1/user -> reset [reset] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Network connection lost.',
  [stderr]     stack: 'AuthRetryableFetchError: Network connection lost.\n' +
  [stderr]       '    at _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13022:9)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)',
  [stderr]     status: 0
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (15ms)
  ```

## C2e: Auth connection reset on getUser, GET /dashboard

- shape: auth unreachable (RST)
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"auth_user":{"mode":"reset"}}
- response: 503 [text/html; charset=utf-8] 16 ms, 332 bytes
- html: title="Service unavailable" headings=["Service unavailable"] role=alert=false alerts=[] notes=[]
- body: "Service unavailable Service unavailable Sign-in is temporarily unavailable. Please try again in a moment."
- stub saw:
  - GET /auth/v1/user -> reset [reset] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/dashboard',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Network connection lost.',
  [stderr]     stack: 'AuthRetryableFetchError: Network connection lost.\n' +
  [stderr]       '    at _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13022:9)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)',
  [stderr]     status: 0
  [stderr]   }
  [stderr] }
  [stdout] GET /dashboard 503 Service Unavailable (12ms)
  ```

## C2c: Auth/PostgREST stub fully stopped (ECONNREFUSED), check-off (JSON)

- shape: auth host down
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok) (stub process stopped during the probe)
- response: 503 [application/json] 25 ms, 34 bytes
- body: "{\"ok\":false,\"error\":\"unavailable\"}"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Network connection lost.',
  [stderr]     stack: 'AuthRetryableFetchError: Network connection lost.\n' +
  [stderr]       '    at _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13022:9)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)',
  [stderr]     status: 0
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (19ms)
  ```

## C2d: stub fully stopped (ECONNREFUSED), GET /dashboard

- shape: auth host down
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok) (stub process stopped during the probe)
- response: 503 [text/html; charset=utf-8] 29 ms, 332 bytes
- html: title="Service unavailable" headings=["Service unavailable"] role=alert=false alerts=[] notes=[]
- body: "Service unavailable Service unavailable Sign-in is temporarily unavailable. Please try again in a moment."
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/dashboard',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Network connection lost.',
  [stderr]     stack: 'AuthRetryableFetchError: Network connection lost.\n' +
  [stderr]       '    at _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13022:9)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)',
  [stderr]     status: 0
  [stderr]   }
  [stderr] }
  [stdout] GET /dashboard 503 Service Unavailable (25ms)
  ```

## C2b: Auth slow: getUser answers after 12 s, check-off (JSON)

- shape: auth slow
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"slow","delayMs":12000}}
- response: 200 [application/json] 12048 ms, 33 bytes
- body: "{\"ok\":true,\"period\":\"2026-10-02\"}"
- stub saw:
  - GET /auth/v1/user -> 200 [slow] (12006 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (1 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 201 (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 200 OK (12043ms)
  ```

## C2h: Auth hangs (never answers), client gives up after 25 s

- shape: auth hang
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_user":{"mode":"hang"}}
- response: CLIENT ERROR TimeoutError: The operation was aborted due to timeout
- stub saw:
  - GET /auth/v1/user -> aborted [hang] (24998 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Network connection lost.',
  [stderr]     stack: 'AuthRetryableFetchError: Network connection lost.\n' +
  [stderr]       '    at _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13022:9)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)',
  [stderr]     status: 0
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 503 Service Unavailable (25002ms)
  ```

## C4: task_checkoffs insert answers 500

- shape: PostgREST 500: supabase-js returns {error}, outcome unknown
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 500 [application/json] 21 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (1 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.failed',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (16ms)
  ```

## C5: task_checkoffs insert: network reset

- shape: postgrest-js returns {error:{code:''}, status:0}
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"reset"}}
- response: 500 [application/json] 20 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> reset [reset] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.failed',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: {
  [stderr]     message: 'Error: Network connection lost.',
  [stderr]     details: 'Error: Network connection lost.'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (15ms)
  ```

## C6: task_checkoffs insert answers 403 / 42501 (RLS refusal)

- shape: RLS/permission failure mapped to forbidden
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":403,"body":{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"task_checkoffs\""}}}
- response: 403 [application/json] 35 ms, 32 bytes
- body: "{\"ok\":false,\"error\":\"forbidden\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 403 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.forbidden',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   status: 403,
  [stderr]   error: {
  [stderr]     message: 'new row violates row-level security policy for table "task_checkoffs"',
  [stderr]     code: '42501'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 403 Forbidden (30ms)
  ```

## C6b: task_checkoffs insert answers 401 PGRST301 JWT expired

- shape: expired access token at PostgREST
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":401,"body":{"code":"PGRST301","details":null,"hint":null,"message":"JWT expired"}}}
- response: 500 [application/json] 29 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 401 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.failed',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: { message: 'JWT expired', code: 'PGRST301' }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (24ms)
  ```

## C7: task_checkoffs insert answers 409 / 23503 (not enrolled)

- shape: FK violation mapped to forbidden
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":409,"body":{"code":"23503","details":"Key (task_id, user_id)=(33333333-3333-4333-8333-333333333333, 11111111-1111-4111-8111-111111111111) is not present in table \"task_participants\".","hint":null,"message":"insert or update on table \"task_checkoffs\" violates foreign key constraint \"task_checkoffs_task_id_user_id_fkey\""}}}
- response: 403 [application/json] 26 ms, 32 bytes
- body: "{\"ok\":false,\"error\":\"forbidden\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 409 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] {
  [stdout]   level: 'info',
  [stdout]   event: 'checkoff.not_enrolled',
  [stdout]   userId: '11111111-1111-4111-8111-111111111111',
  [stdout]   taskId: '33333333-3333-4333-8333-333333333333'
  [stdout] }
  [stdout] POST /api/tasks/checkoff 403 Forbidden (22ms)
  ```

## C7b: task_checkoffs insert answers 409 / 23505 (already ticked)

- shape: idempotent no-op
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":409,"body":{"code":"23505","details":"Key (task_id, user_id, period)=(33333333-3333-4333-8333-333333333333, 11111111-1111-4111-8111-111111111111, 2026-10-02) already exists.","hint":null,"message":"duplicate key value violates unique constraint \"task_checkoffs_pkey\""}}}
- response: 200 [application/json] 25 ms, 33 bytes
- body: "{\"ok\":true,\"period\":\"2026-10-02\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 409 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 200 OK (20ms)
  ```

## C9: uncheck: DELETE answers 200 with [] (zero rows deleted)

- shape: nothing deleted reported as ok
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_delete":{"mode":"empty"}}
- response: 200 [application/json] 34 ms, 33 bytes
- body: "{\"ok\":true,\"period\":\"2026-10-02\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - DELETE /rest/v1/task_checkoffs?task_id=eq.33333333-3333-4333-8333-333333333333&user_id=eq.11111111-1... -> 200 [empty] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] {
  [stdout]   level: 'info',
  [stdout]   event: 'uncheck.nothing_removed',
  [stdout]   userId: '11111111-1111-4111-8111-111111111111',
  [stdout]   taskId: '33333333-3333-4333-8333-333333333333'
  [stdout] }
  [stdout] POST /api/tasks/uncheck 200 OK (29ms)
  ```

## C10: uncheck: DELETE answers 500

- shape: PostgREST 500 on delete
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_delete":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 500 [application/json] 35 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - DELETE /rest/v1/task_checkoffs?task_id=eq.33333333-3333-4333-8333-333333333333&user_id=eq.11111111-1... -> 500 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'uncheck.failed',
  [stderr]   route: '/api/tasks/uncheck',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/tasks/uncheck 500 Internal Server Error (31ms)
  ```

## C10b: uncheck: DELETE network reset

- shape: network failure on delete
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_delete":{"mode":"reset"}}
- response: 500 [application/json] 19 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - DELETE /rest/v1/task_checkoffs?task_id=eq.33333333-3333-4333-8333-333333333333&user_id=eq.11111111-1... -> reset [reset] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'uncheck.failed',
  [stderr]   route: '/api/tasks/uncheck',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: {
  [stderr]     message: 'Error: Network connection lost.',
  [stderr]     details: 'Error: Network connection lost.'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/uncheck 500 Internal Server Error (13ms)
  ```

## J1: join_group RPC answers 500

- shape: PostgREST 500 returned as {error}, route maps it to a redirect
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"rpc_join_group":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 302 -> /dashboard?error=unknown [] 37 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/join_group -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'groups.join.failed',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   status: 500,
  [stderr]   codeLength: 12,
  [stderr]   outcome: 'unknown',
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/groups/join 302 Found (32ms)
  ```

## J2: join_group RPC: network reset

- shape: network failure returned as {error:{code:''}}
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"rpc_join_group":{"mode":"reset"}}
- response: 302 -> /dashboard?error=unknown [] 28 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - POST /rest/v1/rpc/join_group -> reset [reset] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'groups.join.failed',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   status: 0,
  [stderr]   codeLength: 12,
  [stderr]   outcome: 'unknown',
  [stderr]   error: {
  [stderr]     message: 'Error: Network connection lost.',
  [stderr]     details: 'Error: Network connection lost.'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/groups/join 302 Found (24ms)
  ```

## J3: join_group RPC answers P0002 (invalid code)

- shape: legit business error
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"rpc_join_group":{"mode":"status","status":404,"body":{"code":"P0002","details":null,"hint":null,"message":"invalid join code"}}}
- response: 302 -> /dashboard?error=invalid_code [] 43 ms, 0 bytes
- Set-Cookie names: join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/join_group -> 404 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/groups/join 302 Found (38ms)
  ```

## J3b: join with a malformed code in the form (no RPC call)

- shape: validation
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=zzz
- stub modes: (all ok)
- response: 302 -> /dashboard?error=invalid_code [] 28 ms, 0 bytes
- Set-Cookie names: join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/groups/join 302 Found (23ms)
  ```

## J4: join_group RPC answers 23505 (already in a group)

- shape: legit business error
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"rpc_join_group":{"mode":"status","status":409,"body":{"code":"23505","details":"Key (user_id)=(11111111-1111-4111-8111-111111111111) already exists.","hint":null,"message":"duplicate key value violates unique constraint \"group_members_user_id_key\""}}}
- response: 302 -> /dashboard?error=already_in_group [] 32 ms, 0 bytes
- Set-Cookie names: join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/join_group -> 409 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/groups/join 302 Found (26ms)
  ```

## J5: join_group RPC answers 403 / 42501

- shape: permission failure mapped to forbidden
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"rpc_join_group":{"mode":"status","status":403,"body":{"code":"42501","details":null,"hint":null,"message":"permission denied for table task_checkoffs"}}}
- response: 302 -> /dashboard?error=forbidden [] 33 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/join_group -> 403 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'groups.join.failed',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   status: 403,
  [stderr]   codeLength: 12,
  [stderr]   outcome: 'forbidden',
  [stderr]   error: {
  [stderr]     message: 'permission denied for table task_checkoffs',
  [stderr]     code: '42501'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/groups/join 302 Found (27ms)
  ```

## J6a: GET /join/zzz (malformed invite link), signed in

- shape: malformed invite code
- request: GET /join/zzz; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 302 -> /dashboard [] 40 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /join/zzz 302 Found (35ms)
  ```

## J6b: GET /join/abc123def456 (valid hex), signed in

- shape: valid invite code
- request: GET /join/abc123def456; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 302 -> /dashboard [] 49 ms, 0 bytes
- Set-Cookie names: join_code (set)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /join/abc123def456 302 Found (45ms)
  ```

## J6c: GET /join/<65 hex chars> (too long), signed in

- shape: malformed invite code
- request: GET /join/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 302 -> /dashboard [] 43 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /join/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 302 Found (39ms)
  ```

## J6d: GET /join/abc123def456 signed out (public route)

- shape: valid invite code, no session
- request: GET /join/abc123def456; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 302 -> /dashboard [] 21 ms, 0 bytes
- Set-Cookie names: join_code (set)
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /join/abc123def456 302 Found (15ms)
  ```

## P1: P1 throw in a handler (/api/probe?mode=throw)

- shape: exception escapes the handler
- request: GET /api/probe?mode=throw; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 38 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/api/probe',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'probe-handler',
  [stderr]     stack: 'Error: probe-handler\n' +
  [stderr]       '    at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:15:23)\n' +
  [stderr]       '    at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)\n' +
  [stderr]       '    at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21)'
  [stderr]   }
  [stderr] }
  [stderr] 19:51:23 [ERROR] Error: probe-handler
  [stderr]     at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:15:23)
  [stderr]     at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)
  [stderr]     at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21)
  [stdout] GET /api/probe 500 Internal Server Error (34ms)
  ```

## P1b: P1b throw with a cause

- shape: Error with cause escapes the handler
- request: GET /api/probe?mode=throw-cause; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 42 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/api/probe',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'probe-handler',
  [stderr]     stack: 'Error: probe-handler\n' +
  [stderr]       '    at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:16:29)\n' +
  [stderr]       '    at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)\n' +
  [stderr]       '    at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21)'
  [stderr]   }
  [stderr] }
  [stderr] 19:51:25 [ERROR] Error: probe-handler
  [stderr]     at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:16:29)
  [stderr]     at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)
  [stderr]     at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21)
  [stdout] GET /api/probe 500 Internal Server Error (37ms)
  ```

## P1c: P1c throw a plain object (as supabase-js errors are)

- shape: non-Error thrown
- request: GET /api/probe?mode=throw-plain; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 60 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/api/probe',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: { message: 'probe plain object thrown', details: 'd', code: 'XX000' }
  [stderr] }
  [stderr] 19:51:27 [ERROR] probe plain object thrown
  [stdout] GET /api/probe 500 Internal Server Error (55ms)
  ```

## P5a: P5 throw in early middleware, GET /

- shape: middleware throws before getUser
- request: GET /; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 35 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] 19:51:29 [ERROR] Error: probe-middleware
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5000:67)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stderr]     at handleCallbackErrors (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:560:24)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:40
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1244:11
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1034:10
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4274:11
  [stdout] GET / 500 Internal Server Error (30ms)
  ```

## P5b: P5b throw in early middleware, POST /api/tasks/checkoff (JSON)

- shape: middleware throws before the route's own typed error handling
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok)
- response: 500 [] 49 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] 19:51:31 [ERROR] Error: probe-middleware
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5000:67)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stderr]     at handleCallbackErrors (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:560:24)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:40
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1244:11
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1034:10
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4274:11
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (44ms)
  ```

## P9a: P9 console.error('label', new Error(msg, {cause}))

- shape: Error with cause passed as a console argument
- request: GET /api/probe?mode=log-error; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 21 ms, 6 bytes
- body: "logged"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] probe label Error: probe-error
  [stderr]     at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:31:33)
  [stderr]     at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)
  [stderr]     at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21) {
  [stderr]   [cause]: Error: probe-cause
  [stderr]       at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:31:83)
  [stderr]       at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)
  [stderr]       at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21)
  [stderr] }
  [stdout] GET /api/probe 200 OK (11ms)
  ```

## P9b: P9 console.error('label', {message,details,hint,code}) (PostgREST-shaped plain object)

- shape: plain object passed as a console argument
- request: GET /api/probe?mode=log-plain; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 32 ms, 6 bytes
- body: "logged"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] probe label { message: 'm', details: 'd', hint: null, code: 'XX000' }
  [stdout] GET /api/probe 200 OK (21ms)
  ```

## P9c: P9 console.error(`label ${error}`) (template string)

- shape: error interpolated into a string
- request: GET /api/probe?mode=log-string; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 44 ms, 6 bytes
- body: "logged"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] probe label Error: probe-string
  [stdout] GET /api/probe 200 OK (22ms)
  ```

## P9d: P9 console.error(new Error(msg)) (Error alone)

- shape: Error as the only console argument
- request: GET /api/probe?mode=log-error-only; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 33 ms, 6 bytes
- body: "logged"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Error: probe-error-only
  [stderr]     at Module.handler (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/probe_CE4x_HjR.mjs:34:34)
  [stderr]     at renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:31)
  [stderr]     at handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:21)
  [stdout] GET /api/probe 200 OK (23ms)
  ```

## P9e: P9 console.error('label', JSON.stringify(error))

- shape: error JSON-stringified
- request: GET /api/probe?mode=log-json; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 27 ms, 6 bytes
- body: "logged"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] probe label {}
  [stdout] GET /api/probe 200 OK (18ms)
  ```

## C3a: tasks read (getTask) answers 500, check-off

- shape: PostgREST 500; getTask throws the plain error object
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 500 [application/json] 24 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (19ms)
  ```

## C3b: tasks read answers 503 PGRST002 (postgrest-js retries GETs)

- shape: PostgREST schema-cache 503, retried 3x with backoff
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"status","status":503,"body":{"code":"PGRST002","details":null,"hint":"Try again later","message":"Could not query the database for the schema cache. Retrying."}}}
- response: 500 [application/json] 7090 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 503 [status] (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 503 [status] retry#1 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 503 [status] retry#2 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 503 [status] retry#3 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     message: 'Could not query the database for the schema cache. Retrying.',
  [stderr]     hint: 'Try again later',
  [stderr]     code: 'PGRST002'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (7084ms)
  ```

## C3c: tasks read: network reset (postgrest-js retries GETs)

- shape: network failure on GET, retried 3x with backoff
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"reset"}}
- response: 500 [application/json] 7068 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> reset [reset] (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> reset [reset] retry#1 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> reset [reset] retry#2 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> reset [reset] retry#3 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     message: 'Error: Network connection lost.',
  [stderr]     details: 'Error: Network connection lost.'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (7063ms)
  ```

## C3d: tasks read answers 500, uncheck

- shape: PostgREST 500; getTask throws
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 500 [application/json] 25 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'uncheck.exception',
  [stderr]   route: '/api/tasks/uncheck',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/tasks/uncheck 500 Internal Server Error (19ms)
  ```

## C3e: tasks read answers 502 HTML gateway page, check-off

- shape: non-JSON error body: error has a message but no code
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"status","status":502,"contentType":"text/html; charset=utf-8","body":"<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>"}}
- response: 500 [application/json] 24 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 502 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     message: '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (19ms)
  ```

## C8: tasks read returns zero rows, check-off

- shape: RLS-hidden or deleted task: gone
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"empty"}}
- response: 404 [application/json] 18 ms, 27 bytes
- body: "{\"ok\":false,\"error\":\"gone\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 [empty] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] {
  [stdout]   level: 'info',
  [stdout]   event: 'checkoff.task_gone',
  [stdout]   route: '/api/tasks/checkoff',
  [stdout]   userId: '11111111-1111-4111-8111-111111111111',
  [stdout]   ray: null,
  [stdout]   taskId: '33333333-3333-4333-8333-333333333333'
  [stdout] }
  [stdout] POST /api/tasks/checkoff 404 Not Found (13ms)
  ```

## C8b: tasks read returns zero rows, uncheck

- shape: RLS-hidden or deleted task: gone
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"empty"}}
- response: 404 [application/json] 17 ms, 27 bytes
- body: "{\"ok\":false,\"error\":\"gone\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 [empty] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] {
  [stdout]   level: 'info',
  [stdout]   event: 'uncheck.task_gone',
  [stdout]   route: '/api/tasks/uncheck',
  [stdout]   userId: '11111111-1111-4111-8111-111111111111',
  [stdout]   ray: null,
  [stdout]   taskId: '33333333-3333-4333-8333-333333333333'
  [stdout] }
  [stdout] POST /api/tasks/uncheck 404 Not Found (13ms)
  ```

## C11a: non-form body (application/json {}) on check-off

- shape: request.formData() throws
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body={}
- stub modes: (all ok)
- response: 500 [application/json] 22 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'TypeError',
  [stderr]     message: 'Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded',
  [stderr]     stack: 'TypeError: Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded\n' +
  [stderr]       '    at async Module.POST (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/checkoff_CeT2fW-p.mjs:19:16)\n' +
  [stderr]       '    at async renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:17)\n' +
  [stderr]       '    at async handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:15)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5017:10)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)\n' +
  [stderr]       '    at async handleMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14127:14)\n' +
  [stderr]       '    at async render (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:15606:15)\n' +
  [stderr]       '    at async App.render (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:15911:69)\n' +
  [stderr]       '    at async Object.handle [as fetch] (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/entry.mjs:127:19)'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (18ms)
  ```

## C11b: non-form body (application/json {}) on uncheck

- shape: request.formData() throws
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=application/json; body={}
- stub modes: (all ok)
- response: 500 [application/json] 22 ms, 30 bytes
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'uncheck.exception',
  [stderr]   route: '/api/tasks/uncheck',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'TypeError',
  [stderr]     message: 'Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded',
  [stderr]     stack: 'TypeError: Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded\n' +
  [stderr]       '    at async Module.POST (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/uncheck_DNQI6SM2.mjs:19:16)\n' +
  [stderr]       '    at async renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:17)\n' +
  [stderr]       '    at async handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:15)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5017:10)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)\n' +
  [stderr]       '    at async handleMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14127:14)\n' +
  [stderr]       '    at async render (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:15606:15)\n' +
  [stderr]       '    at async App.render (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:15911:69)\n' +
  [stderr]       '    at async Object.handle [as fetch] (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/entry.mjs:127:19)'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/uncheck 500 Internal Server Error (18ms)
  ```

## C12a: plain form POST, ok

- shape: no failure; redirect target
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=-; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok)
- response: 302 -> /dashboard [] 52 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 201 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 302 Found (48ms)
  ```

## C12b: plain form POST, insert answers 500

- shape: redirect target on unknown
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=-; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 302 -> /dashboard?error=unknown [] 30 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.failed',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 302 Found (25ms)
  ```

## C12c: plain form POST, insert answers 403 / 42501

- shape: redirect target on forbidden
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=-; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_insert":{"mode":"status","status":403,"body":{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"task_checkoffs\""}}}
- response: 302 -> /dashboard?error=forbidden [] 39 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 403 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.forbidden',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   status: 403,
  [stderr]   error: {
  [stderr]     message: 'new row violates row-level security policy for table "task_checkoffs"',
  [stderr]     code: '42501'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 302 Found (34ms)
  ```

## C12d: plain form POST, task gone (zero rows)

- shape: redirect target on gone
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=-; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"tasks_get":{"mode":"empty"}}
- response: 302 -> /dashboard [] 35 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 [empty] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] {
  [stdout]   level: 'info',
  [stdout]   event: 'checkoff.task_gone',
  [stdout]   route: '/api/tasks/checkoff',
  [stdout]   userId: '11111111-1111-4111-8111-111111111111',
  [stdout]   ray: null,
  [stdout]   taskId: '33333333-3333-4333-8333-333333333333'
  [stdout] }
  [stdout] POST /api/tasks/checkoff 302 Found (31ms)
  ```

## C12e: plain form POST uncheck, DELETE answers 500

- shape: redirect target on unknown
- request: POST /api/tasks/uncheck; session=true; extra cookies=-; accept=-; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"checkoffs_delete":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 302 -> /dashboard?error=unknown [] 55 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - DELETE /rest/v1/task_checkoffs?task_id=eq.33333333-3333-4333-8333-333333333333&user_id=eq.11111111-1... -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'uncheck.failed',
  [stderr]   route: '/api/tasks/uncheck',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   taskId: '33333333-3333-4333-8333-333333333333',
  [stderr]   error: { message: 'internal error: probe injected failure', code: 'XX000' }
  [stderr] }
  [stdout] POST /api/tasks/uncheck 302 Found (50ms)
  ```

## C13a: dashboard: list_group_members RPC answers 500

- shape: essential read fails: outer catch
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"rpc_list_group_members":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 42 ms, 18463 bytes
- html: title="Dashboard" headings=["Probe Crew","Rename group","Delete group"] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Your group Probe Crew Share this invite link to add people to your group. Copy Rename group Group name Rename group Delete group Permanently delete th"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/list_group_members -> 500 [status] (1 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&group_id=eq.22222222-2222... -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/task_participants?select=task_id%2Cuser_id&order=joined_at.asc%2Cuser_id.asc -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/task_checkoff_periods?select=task_id%2Cuser_id%2Cperiods -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the dashboard failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (33ms)
  ```

## C13b: dashboard: tasks list answers 500

- shape: secondary read fails (allSettled)
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"tasks_list":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 46 ms, 19808 bytes
- html: title="Dashboard" headings=["Probe Crew","Members","Rename group","Delete group"] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Your group Probe Crew Share this invite link to add people to your group. Copy Members 1 member probe@example.test Owner You Rename group Group name R"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&group_id=eq.22222222-2222... -> 500 [status] (1 ms) bearer=user-jwt
  - GET /rest/v1/task_participants?select=task_id%2Cuser_id&order=joined_at.asc%2Cuser_id.asc -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/list_group_members -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/task_checkoff_periods?select=task_id%2Cuser_id%2Cperiods -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the tasks failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (36ms)
  ```

## C13c: dashboard: task_participants list answers 500

- shape: secondary read fails (allSettled)
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"participants_list":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 44 ms, 27331 bytes
- html: title="Dashboard" headings=["Probe Crew","Members","Tasks","Rename group","Delete group"] role=alert=false alerts=[] notes=["Participants are unavailable right now"]
- body: "Dashboard Your group Probe Crew Share this invite link to add people to your group. Copy Members 1 member probe@example.test Owner You Tasks 1 task Probe Task Edit Daily Delete Participants are unavai"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/list_group_members -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&group_id=eq.22222222-2222... -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/task_participants?select=task_id%2Cuser_id&order=joined_at.asc%2Cuser_id.asc -> 500 [status] (0 ms) bearer=user-jwt
  - GET /rest/v1/task_checkoff_periods?select=task_id%2Cuser_id%2Cperiods -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the task participants failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (35ms)
  ```

## C13d: dashboard: task_checkoff_periods answers 500

- shape: secondary read fails (allSettled)
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"periods_list":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 43 ms, 29887 bytes
- html: title="Dashboard" headings=["Probe Crew","Members","Tasks","Rename group","Delete group"] role=alert=false alerts=[] notes=["Scores are unavailable right now"]
- body: "Dashboard Your group Probe Crew Share this invite link to add people to your group. Copy Members 1 member probe@example.test Owner You Tasks 1 task Probe Task Edit Daily Delete Participants: probe@exa"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/list_group_members -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&group_id=eq.22222222-2222... -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/task_participants?select=task_id%2Cuser_id&order=joined_at.asc%2Cuser_id.asc -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/task_checkoff_periods?select=task_id%2Cuser_id%2Cperiods -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the check-offs failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (34ms)
  ```

## C13e: dashboard: getMyGroup (groups) answers 500

- shape: first read fails: outer catch
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"groups_get":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 24 ms, 3156 bytes
- html: title="Dashboard" headings=[] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Signed in as probe@example.test Sign out"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the dashboard failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (16ms)
  ```

## C13f: dashboard: getMyGroup network reset (GET retried 3x)

- shape: network failure on the first read
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: {"groups_get":{"mode":"reset"}}
- response: 200 [text/html] 7084 ms, 3156 bytes
- html: title="Dashboard" headings=[] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Signed in as probe@example.test Sign out"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> reset [reset] (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> reset [reset] retry#1 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> reset [reset] retry#2 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> reset [reset] retry#3 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the dashboard failed {
  [stderr]   message: 'Error: Network connection lost.',
  [stderr]   details: 'Error: Network connection lost.',
  [stderr]   hint: '',
  [stderr]   code: ''
  [stderr] }
  [stdout] GET /dashboard 200 OK (7070ms)
  ```

## J7a: GET /dashboard with join_code cookie, no group, preview_group RPC answers 500

- shape: invite preview fails: outer catch
- request: GET /dashboard; session=true; extra cookies=join_code; accept=-; body=-
- stub modes: {"groups_get":{"mode":"empty"},"rpc_preview_group":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 35 ms, 3156 bytes
- html: title="Dashboard" headings=[] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Signed in as probe@example.test Sign out"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 [empty] (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/preview_group -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the dashboard failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (26ms)
  ```

## J7b: GET /dashboard with join_code cookie, getMyGroup answers 500

- shape: first read fails: outer catch
- request: GET /dashboard; session=true; extra cookies=join_code; accept=-; body=-
- stub modes: {"groups_get":{"mode":"status","status":500,"body":{"code":"XX000","details":null,"hint":null,"message":"internal error: probe injected failure"}}}
- response: 200 [text/html] 41 ms, 3156 bytes
- html: title="Dashboard" headings=[] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Signed in as probe@example.test Sign out"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 500 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] Loading the dashboard failed {
  [stderr]   code: 'XX000',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'internal error: probe injected failure'
  [stderr] }
  [stdout] GET /dashboard 200 OK (26ms)
  ```

## J7c: control: dashboard with join_code cookie, no group, preview ok

- shape: no failure
- request: GET /dashboard; session=true; extra cookies=join_code; accept=-; body=-
- stub modes: {"groups_get":{"mode":"empty"}}
- response: 200 [text/html] 45 ms, 17161 bytes
- html: title="Dashboard" headings=["Join Probe Crew?","Create a group","Join a group"] role=alert=false alerts=[] notes=["You were invited with a link","Create a group","Join a group"]
- body: "Dashboard Join Probe Crew? You were invited with a link. Confirm to become a member. Join group Create a group Start a group and invite others with a link. Group name Create group Join a group Have an"
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 [empty] (0 ms) bearer=user-jwt
  - POST /rest/v1/rpc/preview_group -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /dashboard 200 OK (40ms)
  ```

## J7d: dashboard with join_code cookie, preview_group returns null (unknown code)

- shape: legit business error
- request: GET /dashboard; session=true; extra cookies=join_code; accept=-; body=-
- stub modes: {"groups_get":{"mode":"empty"},"rpc_preview_group":{"mode":"empty"}}
- response: 200 [text/html] 31 ms, 16237 bytes
- Set-Cookie names: join_code (cleared)
- html: title="Dashboard" headings=["Create a group","Join a group"] role=alert=true alerts=["This invite link or code is not valid."] notes=["not valid","Create a group","Join a group"]
- body: "Dashboard This invite link or code is not valid. Create a group Start a group and invite others with a link. Group name Create group Join a group Have an invite? Paste the link or code. Invite code or"
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 200 [empty] (1 ms) bearer=user-jwt
  - POST /rest/v1/rpc/preview_group -> 200 [empty] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /dashboard 200 OK (27ms)
  ```

## J8a: Auth 503 on POST /api/groups/join (join_code cookie)

- shape: auth outage during join
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"auth_user":{"mode":"status","status":503,"body":{"code":503,"error_code":"unexpected_failure","msg":"Service Unavailable"}}}
- response: 503 [text/html; charset=utf-8] 22 ms, 332 bytes
- html: title="Service unavailable" headings=["Service unavailable"] role=alert=false alerts=[] notes=[]
- body: "Service unavailable Service unavailable Sign-in is temporarily unavailable. Please try again in a moment."
- stub saw:
  - GET /auth/v1/user -> 503 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Service Unavailable',
  [stderr]     stack: 'AuthRetryableFetchError: Service Unavailable\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 503
  [stderr]   }
  [stderr] }
  [stdout] POST /api/groups/join 503 Service Unavailable (18ms)
  ```

## J8b: Auth 503 on GET /dashboard carrying join_code cookie

- shape: auth outage on the invite landing
- request: GET /dashboard; session=true; extra cookies=join_code; accept=-; body=-
- stub modes: {"auth_user":{"mode":"status","status":503,"body":{"code":503,"error_code":"unexpected_failure","msg":"Service Unavailable"}}}
- response: 503 [text/html; charset=utf-8] 40 ms, 332 bytes
- html: title="Service unavailable" headings=["Service unavailable"] role=alert=false alerts=[] notes=[]
- body: "Service unavailable Service unavailable Sign-in is temporarily unavailable. Please try again in a moment."
- stub saw:
  - GET /auth/v1/user -> 503 [status] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.unavailable',
  [stderr]   route: '/dashboard',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Service Unavailable',
  [stderr]     stack: 'AuthRetryableFetchError: Service Unavailable\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17704:12\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17696:11)\n' +
  [stderr]       '    at async SupabaseAuthClient.getUser (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17685:17)\n' +
  [stderr]       '    at async resolveAuthState (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:25:36)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:17)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12',
  [stderr]     status: 503
  [stderr]   }
  [stderr] }
  [stdout] GET /dashboard 503 Service Unavailable (37ms)
  ```

## J9: non-form body (application/json {}) on POST /api/groups/join

- shape: request.formData() throws
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body={}
- stub modes: (all ok)
- response: 302 -> /dashboard?error=unknown [] 35 ms, 0 bytes
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'groups.join.exception',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'TypeError',
  [stderr]     message: 'Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded',
  [stderr]     stack: 'TypeError: Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded\n' +
  [stderr]       '    at async Module.POST (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/join_C_lm1tDc.mjs:17:16)\n' +
  [stderr]       '    at async renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:17)\n' +
  [stderr]       '    at async handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:15)\n' +
  [stderr]       '    at async handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5017:10)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:12\n' +
  [stderr]       '    at async callMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14037:9)\n' +
  [stderr]       '    at async handleMiddleware (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:14127:14)\n' +
  [stderr]       '    at async render (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:15606:15)\n' +
  [stderr]       '    at async App.render (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:15911:69)\n' +
  [stderr]       '    at async Object.handle [as fetch] (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/entry.mjs:127:19)'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/groups/join 302 Found (30ms)
  ```

## P4: P4 handler returns 500 without throwing

- shape: 5xx returned, nothing thrown
- request: GET /api/probe?mode=return500; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [text/plain;charset=UTF-8] 21 ms, 9 bytes
- body: "probe-500"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /api/probe 500 Internal Server Error (17ms)
  ```

## P7: P7 floating promise rejection after a 200

- shape: unhandled rejection
- request: GET /api/probe?mode=reject; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 20 ms, 18 bytes
- body: "probe-reject-fired"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /api/probe 200 OK (17ms)
  ```

## P8: P8 waitUntil(Promise.reject(...)) after a 200

- shape: background task fails after the response
- request: GET /api/probe?mode=waituntil-fail; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/plain;charset=UTF-8] 39 ms, 21 bytes
- body: "probe-waituntil-fired"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /api/probe 200 OK (17ms)
  [stderr] NOSENTRY reporting trace with exceptions, but no exception outcome; trace->eventInfo = FetchEventInfo: GET, http://127.0.0.1:4399/api/probe?mode=waituntil-fail
  ```

## P10: P10 throw while the page streams (/probe-stream)

- shape: failure after the first bytes were sent
- request: GET /probe-stream; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/html] 168 ms, 96 bytes
- html: title="probe stream" headings=[] role=alert=false alerts=[] notes=[]
- body: "probe stream stream-start"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /probe-stream 200 OK (17ms)
  [stderr] Uncaught exception: workerd/jsg/_virtual_includes/iterator/workerd/jsg/value.h:1477: failed: remote.jsg.Error: probe-stream
  [stderr] stack: /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@3752547 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@3752b45 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@33f6390 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@33eb3b0 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@33ec04c /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@5b61428 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@315642e /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@3156e9b /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@3157873 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/workerd@2488c67 /home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/node_modules/@cloudflare/workerd-linux-64/bin/work...
  ```

## P3a: P3 POST /api/auth/signout while /auth/v1/logout answers 500

- shape: unwrapped route ignores the sign-out result
- request: POST /api/auth/signout; session=true; extra cookies=-; accept=-; body=
- stub modes: {"auth_logout":{"mode":"status","status":500,"body":{"code":500,"error_code":"unexpected_failure","msg":"Database error querying schema"}}}
- response: 302 -> / [] 32 ms, 0 bytes
- Set-Cookie names: sb-127-auth-token (cleared), join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /auth/v1/logout?scope=global -> 500 [status] (1 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.signout.failed',
  [stderr]   route: '/api/auth/signout',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Database error querying schema',
  [stderr]     stack: 'AuthRetryableFetchError: Database error querying schema\n' +
  [stderr]       '    at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)\n' +
  [stderr]       '    at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async GoTrueAdminApi.signOut (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13170:4)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18410:23\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._signOut (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18401:10)\n' +
  [stderr]       '    at async SupabaseAuthClient.signOut (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18398:10)\n' +
  [stderr]       '    at async Module.POST (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/signout_k4lBgFk2.mjs:12:21)\n' +
  [stderr]       '    at async renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:17)',
  [stderr]     status: 500
  [stderr]   }
  [stderr] }
  [stdout] POST /api/auth/signout 302 Found (27ms)
  ```

## P3b: P3 POST /api/auth/signout while /auth/v1/logout is unreachable (reset)

- shape: unwrapped route ignores the sign-out result
- request: POST /api/auth/signout; session=true; extra cookies=-; accept=-; body=
- stub modes: {"auth_logout":{"mode":"reset"}}
- response: 302 -> / [] 44 ms, 0 bytes
- Set-Cookie names: sb-127-auth-token (cleared), join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - POST /auth/v1/logout?scope=global -> reset [reset] (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'auth.signout.failed',
  [stderr]   route: '/api/auth/signout',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'AuthRetryableFetchError',
  [stderr]     message: 'Network connection lost.',
  [stderr]     stack: 'AuthRetryableFetchError: Network connection lost.\n' +
  [stderr]       '    at _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13022:9)\n' +
  [stderr]       '    at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)\n' +
  [stderr]       '    at async GoTrueAdminApi.signOut (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13170:4)\n' +
  [stderr]       '    at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18410:23\n' +
  [stderr]       '    at async SupabaseAuthClient._useSession (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:17534:11)\n' +
  [stderr]       '    at async SupabaseAuthClient._signOut (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18401:10)\n' +
  [stderr]       '    at async SupabaseAuthClient.signOut (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18398:10)\n' +
  [stderr]       '    at async Module.POST (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/signout_k4lBgFk2.mjs:12:21)\n' +
  [stderr]       '    at async renderEndpoint (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/runtime_B6ZgFDrz.mjs:5851:17)\n' +
  [stderr]       '    at async handlePages (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/entrypoints_Db_uLWjA.mjs:13532:15)',
  [stderr]     status: 0
  [stderr]   }
  [stderr] }
  [stdout] POST /api/auth/signout 302 Found (41ms)
  ```

## P3c: control: POST /api/auth/signout, logout ok

- shape: no failure
- request: POST /api/auth/signout; session=true; extra cookies=-; accept=-; body=
- stub modes: (all ok)
- response: 302 -> / [] 32 ms, 0 bytes
- Set-Cookie names: sb-127-auth-token (cleared), join_code (cleared)
- body: ""
- stub saw:
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /auth/v1/logout?scope=global -> 204 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/auth/signout 302 Found (28ms)
  ```

## P13a: P13 expired token: 2nd refresh answers 400, PostgREST refuses the anon key (check-off JSON)

- shape: getSession() error dropped, anon key sent as Bearer, 42501 on the tasks read
- request: POST /api/tasks/checkoff; session=expired access token; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_token":{"mode":"status","status":400,"body":{"code":400,"error_code":"refresh_token_already_used","msg":"Invalid Refresh Token: Already Used"},"after":1},"rest_anon_guard":{"mode":"anon_guard"}}
- response: 500 [application/json] 44 ms, 30 bytes
- Set-Cookie names: sb-127-auth-token (cleared)
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - POST /auth/v1/token?grant_type=refresh_token -> 200 (0 ms) bearer=anon-key
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - POST /auth/v1/token?grant_type=refresh_token -> 400 [status] (1 ms) bearer=anon-key
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 403 [anon_guard] (0 ms) bearer=anon-key
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: { message: 'permission denied for table tasks', code: '42501' }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (40ms)
  ```

## P13b: P13 expired token: 2nd refresh answers 400, PostgREST refuses the anon key (join_group RPC)

- shape: getSession() error dropped, anon key sent as Bearer, 42501 on the RPC
- request: POST /api/groups/join; session=expired access token; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: {"auth_token":{"mode":"status","status":400,"body":{"code":400,"error_code":"refresh_token_already_used","msg":"Invalid Refresh Token: Already Used"},"after":1},"rest_anon_guard":{"mode":"anon_guard"}}
- response: 302 -> /dashboard?error=forbidden [] 59 ms, 0 bytes
- Set-Cookie names: sb-127-auth-token (cleared)
- body: ""
- stub saw:
  - POST /auth/v1/token?grant_type=refresh_token -> 200 (0 ms) bearer=anon-key
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /auth/v1/token?grant_type=refresh_token -> 400 [status] (0 ms) bearer=anon-key
  - POST /rest/v1/rpc/join_group -> 403 [anon_guard] (0 ms) bearer=anon-key
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'groups.join.failed',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   status: 403,
  [stderr]   codeLength: 12,
  [stderr]   outcome: 'forbidden',
  [stderr]   error: {
  [stderr]     message: 'permission denied for function join_group',
  [stderr]     code: '42501'
  [stderr]   }
  [stderr] }
  [stdout] POST /api/groups/join 302 Found (54ms)
  ```

## P13c: P13 expired token: 2nd refresh answers 500 (retryable: auth-js backs off), anon key refused (check-off JSON)

- shape: retryable refresh failure then anon downgrade
- request: POST /api/tasks/checkoff; session=expired access token; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_token":{"mode":"status","status":500,"body":{"code":500,"error_code":"unexpected_failure","msg":"Database error querying schema"},"after":1},"rest_anon_guard":{"mode":"anon_guard"}}
- response: 500 [application/json] 25575 ms, 30 bytes
- Set-Cookie names: sb-127-auth-token (set)
- body: "{\"ok\":false,\"error\":\"unknown\"}"
- stub saw:
  - POST /auth/v1/token?grant_type=refresh_token -> 200 (1 ms) bearer=anon-key
  - GET /auth/v1/user -> 200 (0 ms) bearer=user-jwt
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - POST /auth/v1/token?grant_type=refresh_token -> 500 [status] (0 ms) bearer=anon-key
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 403 [anon_guard] (1 ms) bearer=anon-key
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] AuthRetryableFetchError: Database error querying schema
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 500,
  [stderr]   code: undefined
  [stderr] }
  [stderr] AuthRetryableFetchError: Database error querying schema
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12979:56)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 500,
  [stderr]   code: undefined
  [stderr] }
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'checkoff.exception',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: '11111111-1111-4111-8111-111111111111',
  [stderr]   ray: null,
  [stderr]   error: { message: 'permission denied for table tasks', code: '42501' }
  [stderr] }
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (25570ms)
  ```

## P13d: P13 control: expired token, both refreshes succeed (check-off JSON)

- shape: two refreshes per request, no failure
- request: POST /api/tasks/checkoff; session=expired access token; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"rest_anon_guard":{"mode":"anon_guard"}}
- response: 200 [application/json] 33 ms, 33 bytes
- Set-Cookie names: sb-127-auth-token (set)
- body: "{\"ok\":true,\"period\":\"2026-10-02\"}"
- stub saw:
  - POST /auth/v1/token?grant_type=refresh_token -> 200 (1 ms) bearer=anon-key
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - POST /auth/v1/token?grant_type=refresh_token -> 200 (0 ms) bearer=anon-key
  - GET /rest/v1/tasks?select=id%2Ctitle%2Crecurrence%2Ccreated_by&id=eq.33333333-3333-4333-... -> 200 (0 ms) bearer=user-jwt
  - POST /rest/v1/task_checkoffs -> 201 (0 ms) bearer=user-jwt
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 200 OK (28ms)
  ```

## P13e: P13 expired token: the 1st refresh (middleware) answers 400 (check-off JSON)

- shape: refresh rejected in the middleware: looks like a sign-out
- request: POST /api/tasks/checkoff; session=expired access token; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: {"auth_token":{"mode":"status","status":400,"body":{"code":400,"error_code":"refresh_token_already_used","msg":"Invalid Refresh Token: Already Used"}},"rest_anon_guard":{"mode":"anon_guard"}}
- response: 302 -> /auth/signin [] 55 ms, 0 bytes
- Set-Cookie names: sb-127-auth-token (cleared)
- body: ""
- stub saw:
  - POST /auth/v1/token?grant_type=refresh_token -> 400 [status] (1 ms) bearer=anon-key
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stdout] POST /api/tasks/checkoff 302 Found (51ms)
  ```

## P13f: P13 expired token: 2nd refresh answers 400, GET /dashboard

- shape: anon downgrade on the dashboard reads
- request: GET /dashboard; session=expired access token; extra cookies=-; accept=-; body=-
- stub modes: {"auth_token":{"mode":"status","status":400,"body":{"code":400,"error_code":"refresh_token_already_used","msg":"Invalid Refresh Token: Already Used"},"after":1},"rest_anon_guard":{"mode":"anon_guard"}}
- response: 200 [text/html] 45 ms, 3156 bytes
- Set-Cookie names: sb-127-auth-token (cleared)
- html: title="Dashboard" headings=[] role=alert=true alerts=["Something went wrong. Please try again."] notes=["Something went wrong"]
- body: "Dashboard Something went wrong. Please try again. Signed in as probe@example.test Sign out"
- stub saw:
  - POST /auth/v1/token?grant_type=refresh_token -> 200 (1 ms) bearer=anon-key
  - GET /auth/v1/user -> 200 (1 ms) bearer=user-jwt
  - POST /auth/v1/token?grant_type=refresh_token -> 400 [status] (0 ms) bearer=anon-key
  - GET /rest/v1/groups?select=id%2Cname%2Cjoin_code%2Cowner_id -> 403 [anon_guard] (0 ms) bearer=anon-key
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] AuthApiError: Invalid Refresh Token: Already Used
  [stderr]     at handleError (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12988:8)
  [stderr]     at async _handleRequest (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13024:18)
  [stderr]     at async _request (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:13007:15)
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:18971:12
  [stderr]     at async file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:12669:20 {
  [stderr]   __isAuthError: true,
  [stderr]   status: 400,
  [stderr]   code: 'refresh_token_already_used'
  [stderr] }
  [stderr] Loading the dashboard failed {
  [stderr]   code: '42501',
  [stderr]   details: null,
  [stderr]   hint: null,
  [stderr]   message: 'permission denied for table groups'
  [stderr] }
  [stdout] GET /dashboard 200 OK (37ms)
  ```

## P12a-unset: [SUPABASE_URL and SUPABASE_KEY unset] secrets visible to the Worker? (/api/probe?mode=env)

- shape: env check
- request: GET /api/probe?mode=env; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [application/json] 15 ms, 31 bytes
- body: "{\"urlSet\":false,\"keySet\":false}"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /api/probe 200 OK (9ms)
  ```

## P12b-unset: [SUPABASE_URL and SUPABASE_KEY unset] GET / (landing page)

- shape: env misconfigured
- request: GET /; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/html] 28 ms, 5010 bytes
- html: title="10x Astro Starter" headings=["10x Astro Starter"] role=alert=true alerts=["Uwaga: Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone. Zobacz instrukcję konfiguracji ."] notes=["Supabase nie jest skonfigurowany"]
- body: "10x Astro Starter Uwaga: Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone. Zobacz instrukcję konfiguracji . Not signed in Sign in Sign up 10x Astro Starter A production-ready s"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET / 200 OK (22ms)
  ```

## P12c-unset: [SUPABASE_URL and SUPABASE_KEY unset] GET /auth/signin

- shape: env misconfigured
- request: GET /auth/signin; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 200 [text/html] 44 ms, 13273 bytes
- Set-Cookie names: auth_email (cleared)
- html: title="Sign in" headings=["Sign in"] role=alert=true alerts=["Uwaga: Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone. Zobacz instrukcję konfiguracji ."] notes=["Supabase nie jest skonfigurowany"]
- body: "Sign in Uwaga: Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone. Zobacz instrukcję konfiguracji . Sign in Email Password Sign in Don't have an account? Sign up"
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /auth/signin 200 OK (38ms)
  ```

## P12d-unset: [SUPABASE_URL and SUPABASE_KEY unset] GET /dashboard with a session cookie

- shape: env misconfigured
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 302 -> /auth/signin [] 37 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] GET /dashboard 302 Found (33ms)
  ```

## P12e-unset: [SUPABASE_URL and SUPABASE_KEY unset] POST /api/tasks/checkoff (JSON) with a session cookie

- shape: env misconfigured
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok)
- response: 302 -> /auth/signin [] 33 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/tasks/checkoff 302 Found (23ms)
  ```

## P12f-unset: [SUPABASE_URL and SUPABASE_KEY unset] POST /api/groups/join with a session and join_code cookie

- shape: env misconfigured
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: (all ok)
- response: 302 -> /auth/signin [] 20 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stdout] POST /api/groups/join 302 Found (14ms)
  ```

## P12a-malformed: [SUPABASE_URL malformed ('not-a-url')] secrets visible to the Worker? (/api/probe?mode=env)

- shape: env check
- request: GET /api/probe?mode=env; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 61 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/api/probe',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
  [stderr]     stack: 'Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.\n' +
  [stderr]       '    at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)\n' +
  [stderr]       '    at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)\n' +
  [stderr]       '    at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)\n' +
  [stderr]       '    at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)\n' +
  [stderr]       '    at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)\n' +
  [stderr]       '    at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67'
  [stderr]   }
  [stderr] }
  [stderr] 19:54:12 [ERROR] Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
  [stderr]     at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)
  [stderr]     at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)
  [stderr]     at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)
  [stderr]     at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)
  [stderr]     at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stdout] GET /api/probe 500 Internal Server Error (55ms)
  ```

## P12b-malformed: [SUPABASE_URL malformed ('not-a-url')] GET / (landing page)

- shape: env misconfigured
- request: GET /; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 44 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
  [stderr]     stack: 'Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.\n' +
  [stderr]       '    at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)\n' +
  [stderr]       '    at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)\n' +
  [stderr]       '    at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)\n' +
  [stderr]       '    at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)\n' +
  [stderr]       '    at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)\n' +
  [stderr]       '    at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67'
  [stderr]   }
  [stderr] }
  [stderr] 19:54:14 [ERROR] Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
  [stderr]     at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)
  [stderr]     at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)
  [stderr]     at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)
  [stderr]     at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)
  [stderr]     at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stdout] GET / 500 Internal Server Error (38ms)
  ```

## P12c-malformed: [SUPABASE_URL malformed ('not-a-url')] GET /auth/signin

- shape: env misconfigured
- request: GET /auth/signin; session=false; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 49 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/auth/signin',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
  [stderr]     stack: 'Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.\n' +
  [stderr]       '    at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)\n' +
  [stderr]       '    at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)\n' +
  [stderr]       '    at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)\n' +
  [stderr]       '    at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)\n' +
  [stderr]       '    at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)\n' +
  [stderr]       '    at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67'
  [stderr]   }
  [stderr] }
  [stderr] 19:54:16 [ERROR] Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
  [stderr]     at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)
  [stderr]     at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)
  [stderr]     at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)
  [stderr]     at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)
  [stderr]     at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stdout] GET /auth/signin 500 Internal Server Error (43ms)
  ```

## P12d-malformed: [SUPABASE_URL malformed ('not-a-url')] GET /dashboard with a session cookie

- shape: env misconfigured
- request: GET /dashboard; session=true; extra cookies=-; accept=-; body=-
- stub modes: (all ok)
- response: 500 [] 34 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/dashboard',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
  [stderr]     stack: 'Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.\n' +
  [stderr]       '    at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)\n' +
  [stderr]       '    at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)\n' +
  [stderr]       '    at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)\n' +
  [stderr]       '    at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)\n' +
  [stderr]       '    at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)\n' +
  [stderr]       '    at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67'
  [stderr]   }
  [stderr] }
  [stderr] 19:54:18 [ERROR] Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
  [stderr]     at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)
  [stderr]     at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)
  [stderr]     at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)
  [stderr]     at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)
  [stderr]     at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stdout] GET /dashboard 500 Internal Server Error (29ms)
  ```

## P12e-malformed: [SUPABASE_URL malformed ('not-a-url')] POST /api/tasks/checkoff (JSON) with a session cookie

- shape: env misconfigured
- request: POST /api/tasks/checkoff; session=true; extra cookies=-; accept=application/json; body=task_id=33333333-3333-4333-8333-333333333333
- stub modes: (all ok)
- response: 500 [] 47 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/api/tasks/checkoff',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
  [stderr]     stack: 'Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.\n' +
  [stderr]       '    at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)\n' +
  [stderr]       '    at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)\n' +
  [stderr]       '    at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)\n' +
  [stderr]       '    at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)\n' +
  [stderr]       '    at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)\n' +
  [stderr]       '    at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67'
  [stderr]   }
  [stderr] }
  [stderr] 19:54:20 [ERROR] Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
  [stderr]     at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)
  [stderr]     at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)
  [stderr]     at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)
  [stderr]     at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)
  [stderr]     at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stdout] POST /api/tasks/checkoff 500 Internal Server Error (36ms)
  ```

## P12f-malformed: [SUPABASE_URL malformed ('not-a-url')] POST /api/groups/join with a session and join_code cookie

- shape: env misconfigured
- request: POST /api/groups/join; session=true; extra cookies=join_code; accept=-; body=code=abc123def456
- stub modes: (all ok)
- response: 500 [] 39 ms, 0 bytes
- body: ""
- stub saw: (no requests)
- console (verbatim, preview process stdout/stderr during the probe):
  ```text
  [stderr] {
  [stderr]   level: 'error',
  [stderr]   event: 'request.unhandled',
  [stderr]   route: '/api/groups/join',
  [stderr]   userId: null,
  [stderr]   ray: null,
  [stderr]   error: {
  [stderr]     name: 'Error',
  [stderr]     message: 'Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.',
  [stderr]     stack: 'Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.\n' +
  [stderr]       '    at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)\n' +
  [stderr]       '    at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)\n' +
  [stderr]       '    at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)\n' +
  [stderr]       '    at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)\n' +
  [stderr]       '    at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)\n' +
  [stderr]       '    at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84\n' +
  [stderr]       '    at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67'
  [stderr]   }
  [stderr] }
  [stderr] 19:54:22 [ERROR] Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
  [stderr]     at validateSupabaseUrl (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:20992:48)
  [stderr]     at new SupabaseClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21228:19)
  [stderr]     at createClient$1 (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:21483:9)
  [stderr]     at createServerClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22365:17)
  [stderr]     at createClient (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/chunks/supabase_EUhUoyVG.mjs:22403:9)
  [stderr]     at handle (file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5002:40)
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:5023:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:4891:18
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:995:84
  [stderr]     at file:///home/mariusz/code/streak-board/.claude/worktrees/agent-ab9c8d9eb9d3b5bd2/dist/server/virtual_astro_middleware.mjs:1246:67
  [stdout] POST /api/groups/join 500 Internal Server Error (33ms)
  ```
