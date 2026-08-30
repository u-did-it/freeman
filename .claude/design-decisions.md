# Design Decisions

_This file is auto-imported by CLAUDE.md. Log every significant architectural decision here with the reason._

---

## DD-001 — SQLite as the only database
**Decision:** Ship with SQLite only. No MySQL/PostgreSQL support.
**Reason:** Simplifies self-hosting dramatically. Target users are small teams running this on a VPS or local machine. SQLite is more than sufficient for the expected data volume (API request collections, not transactional data).

---

## DD-002 — Laravel proxies all HTTP requests via Guzzle
**Decision:** All outgoing API calls go through `RequestRunnerService` on the server, not the browser.
**Reason:** Browser-based fetch hits CORS restrictions on most APIs, making it unusable as an API client. Server-side proxying bypasses CORS entirely and enables server-side logging, response storage, and response time measurement.

---

## DD-003 — No frontend build step (CDN only)
**Decision:** Tailwind CSS and Alpine.js loaded via CDN. No Vite, no npm for frontend.
**Reason:** This is an open-source self-hosted tool. Eliminating the build step makes contribution and deployment simpler. Trade-off is no tree-shaking on Tailwind, which is acceptable for an internal tool.

---

## DD-004 — Session-based auth (not JWT)
**Decision:** Standard Laravel session auth via `Auth::attempt()`.
**Reason:** This is a web app with Blade views, not a decoupled SPA consuming an API. Sessions are simpler, more secure for this use case, and require no token management.

---

## DD-005 — Per-user isolated workspaces (revised by DD-012)
**Decision:** ~~Collections, environments, and history are all scoped to the owning user.~~ See DD-012.
**What remains per-user:** Environments, request history (`request_logs`).

---

## DD-006 — Super Admin creates all users (no self-registration)
**Decision:** Only Super Admin can create user accounts. No public registration.
**Reason:** This is a self-hosted internal tool. The deployer (Super Admin) controls who has access. Self-registration would be a security risk for teams exposing this on a network.

---

## DD-007 — Postman-compatible collection export format
**Decision:** Export collections as Postman Collection v2.1 JSON format.
**Reason:** Allows users to migrate from Postman without losing their saved requests. Also enables importing existing Postman collections into Freeman.

---

## DD-008 — No pre-request or test scripts in v1
**Decision:** Skip JavaScript scripting (pre-request scripts, test assertions) for v1.
**Reason:** Requires sandboxed JS execution on the server — significant complexity and security surface area. Not core to v1 usefulness. Planned for v2.

---

## DD-009 — `{{variable}}` syntax for environment variables
**Decision:** Use double-curly `{{VARIABLE_NAME}}` syntax in URLs, headers, and body — matching Postman's syntax.
**Reason:** Familiar to Postman users. Makes imported Postman collections work without modification.

---

## DD-010 — Collection variables instead of global environments for v1
**Decision:** Variables are scoped to a collection (`collection_variables` table), not to a global environment. Environment switching is deferred to v2.
**Reason:** For a small-team self-hosted tool, per-collection variables cover the majority of use cases (base URL, auth tokens per service) without the added complexity of environment switching UI. The substitution layer already supports priority merging (`collection vars < env vars`) so environments can be layered on top in v2 with no breaking changes.

---

## DD-011 — Variable priority: collection vars < env vars
**Decision:** When both a collection variable and an environment variable share the same key, the environment variable wins (`array_merge($collectionVars, $envVars)`).
**Reason:** Matches Postman's precedence model. Allows environment variables to override collection defaults (e.g. collection sets `BASE_URL=localhost`, environment overrides to `BASE_URL=https://api.prod.com`). Implemented now even though env vars are v2, so the merge logic never needs to change.

---

## DD-013 — File uploads in form-data are ephemeral; only field metadata persists
**Decision:** When a form-data row is set to type `file`, the `type: 'file'` field is saved in `body_form` JSON so other users know the field expects a file. The actual `File` object is never stored — it lives only in `window.__fileInputMap` (a plain JS object) for the duration of the browser session.
**Reason:** Files are user-specific and potentially large. Storing them server-side per-request would require a file storage layer and a cleanup strategy. Ephemeral files keep the feature simple while still signalling to collaborators that a file field is needed.
**Implementation note:** When file rows are present, `/run` is sent as `multipart/form-data` (using the browser's `FormData` API) instead of JSON. The backend detects this via `$request->file('body_form_files')` and `$request->input('body_form')`. Complex fields that can't be encoded in FormData (`headers`, `auth_data`) are JSON-stringified by the frontend and decoded in `RunnerController` before being passed to the service.

---

## DD-014 — Alpine.js split into Alpine.store + Alpine.data components
**Decision:** Refactored the monolithic `workspace()` Alpine.js function (~1490 lines in a single Blade partial) into a shared `Alpine.store('workspace')` backed by six focused `Alpine.data()` components, each in its own file under `public/js/`.
**Components:**
- `Alpine.store('workspace')` — shared state (tabs, collections, environments) + core methods (load, openRequest, persistTabs)
- `workspaceShell` — root layout component: tab bar actions, env switching, Ctrl+S dispatch
- `sidebarComponent` — sidebar UI state, collection/folder CRUD, import/export
- `requestBuilderComponent` — request/response panel: send, URL highlight, var autocomplete, file upload
- `saveModalComponent` — save-request modal and save/PATCH logic
- `collectionVarsModalComponent` — collection variables modal
**Reason:** The monolithic approach made it impossible to navigate or reason about the code. Separate components establish clear ownership of state and enforce explicit cross-component contracts (via `Alpine.store` reads and `window.dispatchEvent` for sibling communication).
**Cross-component events:** `freeman:save-request` (shell/builder → saveModal), `freeman:open-collection-vars` (sidebar → collectionVarsModal), `freeman:tab-closed` (shell → requestBuilder for fileSelectedMap cleanup).
**File locations:** `public/js/` (not `resources/js/`) because DD-003 means no build step — files are served directly via `asset()`.

---

## DD-012 — Collections shared across all users
**Decision:** Collections (and the requests/folders/variables inside them) are visible and editable by every authenticated user. The `user_id` column on `collections` and `requests` is retained as an audit "created_by" field but is not used for access control.
**Reason:** Teams working on the same instance need to collaborate on the same API collections. Per-user isolation made sense for personal tooling but is a blocker for team use. Environments and request history remain per-user (personal state).

---

## DD-015 — Tab bar right-click context menu with batched unsaved-changes warning
**Decision:** Right-clicking a request tab opens a context menu (Close, Close Others, Close to the Right, Close to the Left, Close All) styled to match the existing user/env dropdown menus (`workspace/topbar.blade.php`). Items that would be a no-op (e.g. "Close to the Right" on the last tab) are greyed out. Bulk-close actions that would close one or more dirty tabs show a single batched `window.confirm()` ("N tab(s) have unsaved changes...") rather than one confirm per tab.
**Reason:** Matches the VS Code/Postman tab convention users expect. A single batched confirm keeps the existing lightweight `window.confirm()` pattern (already used for single-tab close) consistent instead of introducing a new custom modal component just for multi-tab warnings.
**Implementation:** `removeTabs()` batch-removal added to `Alpine.store('workspace')` (`public/js/freeman-store.js`); `_closeTabs()` helper + `openTabContextMenu`/`closeTabContextMenu` state added to `workspaceShell` (`public/js/freeman-shell.js`); menu markup in `resources/views/workspace.blade.php`. This is the first `@contextmenu` usage in the codebase.

---

## DD-016 — Header/param value cap raised to 8192 chars; frontend surfaces real validation errors
**Decision:** `headers.*.value` (in `RunRequestRequest`, `StoreRequestRequest`, `UpdateRequestRequest`) and `params.*.value` (in `StoreRequestRequest`, `UpdateRequestRequest`) were capped at `max:1000`, silently rejecting real-world bearer tokens/JWTs/base64 blobs over 1000 characters with a 422. Raised to `max:8192` — generous enough for real tokens while still matching the practical header-size ceilings most web servers/proxies enforce (e.g. nginx's default 8k header buffer), so it isn't unbounded.
**Reason:** A user reported "Request Failed" with no detail when pasting a ~1200-char auth token into a header field. Root cause was the 1000-char cap rejecting the request before it ever reached `RequestRunnerService`.
**Contributing bug also fixed:** `public/js/freeman-request-builder.js`'s `sendRequest()` assigned `await res.json()` straight to `tab.response` with no `res.ok` check, so Laravel's default validation-error body (`{message, errors}`, no `success`/`error` keys) rendered as a blank "Request Failed" card (`resources/views/workspace/response-panel.blade.php`) instead of showing the real message. Now, any non-2xx response without a `success` key is normalized into `{success:false, error: <first validation message or data.message>, ...}` before being stored on `tab.response`, so future validation failures on `/run` are self-diagnosing instead of silent.