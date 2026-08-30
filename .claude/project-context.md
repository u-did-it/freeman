# Project Context

_This file is auto-imported by CLAUDE.md. Keep it updated after every feature._

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| username | string unique | Login identifier |
| password | string | Bcrypt hashed |
| is_super_admin | boolean | Default false |
| must_change_password | boolean | True on first login |
| created_at / updated_at | timestamps | |

### `collections`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| user_id | FK → users | Owner |
| name | string | |
| description | string nullable | |
| created_at / updated_at | timestamps | |

### `collection_folders`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| collection_id | FK → collections | |
| parent_folder_id | FK → self nullable | Nested folders |
| name | string | |
| created_at / updated_at | timestamps | |

### `requests`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| collection_id | FK → collections nullable | Null = unsaved/scratch |
| folder_id | FK → collection_folders nullable | |
| user_id | FK → users | Owner |
| name | string | |
| method | enum | GET, POST, PUT, PATCH, DELETE |
| url | string | Can contain `{{variable}}` placeholders |
| headers | json nullable | Array of {key, value, enabled} |
| body_type | enum nullable | none, raw, form-data, x-www-form-urlencoded |
| body | text nullable | Raw body content |
| body_form | json nullable | Array of {key, value, enabled, type} where type = 'text' \| 'file' |
| auth_type | enum nullable | none, bearer, basic, api_key |
| auth_data | json nullable | Stores token/credentials |
| created_at / updated_at | timestamps | |

### `environments`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| user_id | FK → users | Owner |
| name | string | e.g. "Production", "Local" |
| is_active | boolean | Only one active per user |
| created_at / updated_at | timestamps | |

### `environment_variables`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| environment_id | FK → environments | |
| key | string | e.g. "BASE_URL" |
| value | text | Unbounded — see DD-017 |
| enabled | boolean | Default true |

### `collection_variables`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| collection_id | FK → collections | |
| key | string | e.g. "BASE_URL" |
| value | text | Unbounded — see DD-017 |
| enabled | boolean | Default true |

### `request_logs` (Request History)
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| user_id | FK → users | |
| request_id | FK → requests nullable | Null if run from scratch |
| method | string | |
| url | string | Final URL after variable substitution |
| request_headers | json | |
| request_body | text nullable | |
| response_status | integer | HTTP status code |
| response_headers | json | |
| response_body | text | Raw response |
| response_time_ms | integer | Round-trip time in ms |
| executed_at | timestamp | |

---

## Frontend JS Files

Located in `public/js/` — served directly via `asset()`, no build step (see DD-003, DD-014).

| File | Alpine registration | Responsibility |
|---|---|---|
| `freeman-utils.js` | Global functions | `methodColor`, `statusColor`, `statusText`, `escHtml`, `detectContentType`, `varLabel`, `responseSize` |
| `freeman-store.js` | `Alpine.store('workspace')` | Shared state (tabs, collections, environments), core tab/load methods |
| `freeman-shell.js` | `Alpine.data('workspaceShell')` | Root layout, tab bar actions, env switching, Ctrl+S dispatch |
| `freeman-sidebar.js` | `Alpine.data('sidebarComponent')` | Sidebar state, collection/folder CRUD, import/export |
| `freeman-request-builder.js` | `Alpine.data('requestBuilderComponent')` | Send request, URL highlight, var autocomplete, file upload, response rendering |
| `freeman-modals.js` | `Alpine.data('saveModalComponent')` + `Alpine.data('collectionVarsModalComponent')` | Save-request modal, collection variables modal |

All files register via `document.addEventListener('alpine:init', ...)` and are loaded before the Alpine CDN `<script defer>` in `layouts/app.blade.php`.

---

## Services

| Service | Location | Responsibility |
|---|---|---|
| `RequestRunnerService` | `app/Services/RequestRunnerService.php` | Executes outgoing HTTP calls via Guzzle, substitutes collection + env variables, logs to `request_logs` |
| `EnvironmentService` | `app/Services/EnvironmentService.php` | Resolves active environment, substitutes `{{variables}}` in URLs/headers/body (env vars override collection vars) |
| `CollectionExportService` | `app/Services/CollectionExportService.php` | Exports collection to Postman v2.1 JSON (GET /collections/{id}/export) |
| `CollectionImportService` | `app/Services/CollectionImportService.php` | Imports Postman v2.1 JSON file, creates collection/folders/requests recursively (POST /collections/import) |

## Artisan Commands

| Command | Location | Description |
|---|---|---|
| `php artisan freeman:install` | `app/Console/Commands/FreemanInstall.php` | Interactive install wizard: copies .env, generates key, creates SQLite file, runs migrations, creates super admin |

---

## Key Routes (planned)

```
GET  /                              → redirect to /workspace
GET  /workspace                     → main app view (Blade SPA-like)
POST /run                           → execute a request (RequestRunnerService)
GET  /collections                   → list user's collections
POST /collections                   → create collection
PATCH /collections/{id}             → update collection
DELETE /collections/{id}            → delete collection
GET  /collections/{id}/export       → download collection JSON
POST /collections/import            → upload + import collection JSON
GET  /collections/{id}/variables    → get collection variables
PATCH /collections/{id}/variables   → sync collection variables
GET  /environments                  → list environments (with variables)
POST /environments                  → create environment
PATCH /environments/{id}            → update environment name + sync variables
DELETE /environments/{id}           → delete environment
POST /environments/{id}/activate    → set active environment (deactivates others)
POST /environments/deactivate       → clear active environment
GET  /history                       → request history log
GET  /admin/users                   → super admin user management
POST /admin/users                   → create user
DELETE /admin/users/{id}            → delete user
```

---

## Module Status

| Module | Status |
|---|---|
| Laravel scaffold + SQLite setup | ✅ Done |
| Database migrations (all tables) | ✅ Done |
| Auth (login/logout/change password) | ✅ Done |
| Super Admin user management | ✅ Done |
| Collections + folders | ✅ Done |
| Saved request CRUD (backend) | ✅ Done |
| Request builder UI | ✅ Done |
| File upload in form-data body | ✅ Done |
| Request execution (Guzzle proxy) | ✅ Done |
| Collection variables (`{{VAR}}` substitution) | ✅ Done |
| Shared collections (all users) | ✅ Done |
| Environments + variables | ⏳ Not started (v2) |
| Request history | ⏳ Not started |
| Import/Export collections | ✅ Done |
| Auth helpers (Bearer/Basic/API Key) | ✅ Done (UI in Auth tab) |
| Response pretty-print (JSON) | ✅ Done |
| `freeman:install` wizard | ✅ Done |
| Error pages (403, 404, 429, 500) | ✅ Done |
| Rate limiting on POST /run | ✅ Done (60 req/min per user) |
| README + installation docs | ✅ Done |