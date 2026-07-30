# Documentation

KinMarché is a Loss & Prevention platform. It reconciles what a store's books say it holds against what is physically counted on its shelves, and attributes the difference. Three roles form the chain: an **administrator** uploads the book figures and runs each counting cycle, a **store manager** counts and explains discrepancies, and an **area manager** reviews each submission and either approves it or sends it back for a recount.

One rule underpins everything else and is worth knowing before you read any further: **the uploaded book figure is read-only for every role, including administrators.** Shrinkage is the gap between that figure and the count, so nobody in the chain can edit the number they are measured against. Corrections happen through recounts and audited overrides, never by quietly moving the baseline. Where that shows up in the code is documented in [security.md](developer/security.md) and [database-schema.md](developer/database-schema.md).

The interface is available in English and French.

## Where to start

| If you are… | Read |
|---|---|
| Setting the project up locally | [getting-started.md](developer/getting-started.md), then [architecture.md](developer/architecture.md) |
| Changing server code | [architecture.md](developer/architecture.md) and [security.md](developer/security.md) before you touch `InventoryRecord` |
| Integrating with the API | [api-reference.md](developer/api-reference.md) |
| Deploying or on call | [deployment.md](developer/deployment.md) |
| Counting stock in a store | [store-manager-guide.md](user/store-manager-guide.md) |
| Reviewing store submissions | [area-manager-guide.md](user/area-manager-guide.md) |
| Running cycles for the network | [admin-guide.md](user/admin-guide.md) |

## [developer/](developer/)

Technical reference for anyone building, deploying, or maintaining KinMarché.

| Doc | Covers |
|---|---|
| [getting-started.md](developer/getting-started.md) | Local setup, environment variables, npm scripts, the checks to run before pushing |
| [architecture.md](developer/architecture.md) | Component map, data flows, caching and invalidation, i18n, design decisions |
| [api-reference.md](developer/api-reference.md) | Every REST endpoint with request/response examples |
| [database-schema.md](developer/database-schema.md) | Tables, relationships, indexes, soft deletes, what is writable and by whom |
| [security.md](developer/security.md) | Auth, access control, data integrity, rate limiting, secrets, incident checklist |
| [deployment.md](developer/deployment.md) | Render, Supabase, VPS + PM2 + Nginx, email setup, operating notes |

## [user/](user/)

Plain-language guides for the people who use the app day to day — no technical background assumed.

| Doc | Covers |
|---|---|
| [store-manager-guide.md](user/store-manager-guide.md) | Signing in, entering counts, submitting a cycle, handling a returned submission |
| [area-manager-guide.md](user/area-manager-guide.md) | Reviewing, editing, approving, and returning store submissions |
| [admin-guide.md](user/admin-guide.md) | Running cycles, managing stores and users, deadlines, reports, analytics |
| [limitations.md](user/limitations.md) | File size, session length, and other real-world limits, in plain terms |

These docs are versioned with the code. If you change behaviour that one of them describes, change the doc in the same commit.
