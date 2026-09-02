# gotc-server

The API for GOTC — Garment Operation & Thread Cone planning.

Node 20+ · Express 5 · TypeScript (strict) · Mongoose 8 · zod · JWT in an httpOnly cookie.

---

## Running it

```bash
npm install
cp .env.example .env        # then set JWT_SECRET and MONGODB_URI
npm run seed:reset          # builds the demonstration factory
npm run dev                 # http://localhost:4000/api
```

`GET /api/health` → `{ "ok": true, "db": "connected" }`.

Sign in with any seeded account; the password for all of them is `demo1234`:

| Email | Role |
|---|---|
| `r.fernando@factory.lk` | Admin |
| `s.jaya@factory.lk` | Fabric technician |
| `n.perera@factory.lk` | Garment technician |
| `k.aluthge@factory.lk` | Project manager |

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run build` / `npm start` | `tsc` to `dist/`, then run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | the calculation vectors **and** the API integration suite |
| `npm run seed` | seeds, refusing if the database already holds data |
| `npm run seed:reset` | drops the GOTC collections and rebuilds |

### About the database

`npm run seed:reset` empties **only the nine GOTC collections** (`users`,
`rolepermissions`, `threads`, `machinetypes`, `fabrics`, `garments`, `operations`,
`coneorders`, `counters`). It never drops a database. Even so, point `MONGODB_URI` at a
database of GOTC's own — those collection names are common enough to collide with another
project's.

Transactions need a replica set. Atlas is one; a plain local `mongod` is not, and the server
falls back to non-transactional multi-document writes with a warning (see `NOTES.md`). For
real atomicity locally, run a single-node replica set:

```bash
mongod --replSet rs0 --dbpath ./data
mongosh --eval 'rs.initiate()'
# MONGODB_URI=mongodb://127.0.0.1:27017/gotc?replicaSet=rs0
```

---

## Layout

```
src/
├── index.ts                    boot: connect, cache the role matrix, listen, shut down cleanly
├── app.ts                      the Express app (helmet, cors, cookies, routes, error handler)
├── config/                     env.ts (zod, fails fast) · db.ts (connect with retry)
├── constants/domain.ts         roles, permissions, positions, statuses, transitions
├── domain/
│   ├── threadCalculation.ts    ← every metre and every cone. Pure functions.
│   └── threadCalculation.test.ts
├── models/                     Mongoose schemas, indexes, invariant hooks
├── schemas/                    zod request schemas — the API contract
├── dto/api-types.ts            every response shape; the client mirrors this file
├── services/                   business rules and transactions
├── controllers/                zod parse → service → status + json
├── routes/                     paths and guards only
├── middleware/                 auth, permissions, rate limit, the error envelope
├── seed/                       seed-data.ts · seed-runner.ts · seed.ts (CLI)
├── test/                       supertest suite against an in-memory replica set
└── utils/                      HttpError, logger, transactions, async handler
```

---

## Responses

**Success** bodies are the payload, bare: `200` read/update, `201` create, `204` delete.

**Every** failure — thrown, rejected, zod, Mongoose, duplicate key — leaves through one
middleware in one shape:

```json
{
  "error": {
    "code": "IN_USE",
    "message": "Single Jersey 30s is used on STY-4471, STY-4488. Remove it from those garments first.",
    "details": { "styleNumbers": ["STY-4471", "STY-4488"] }
  }
}
```

`details` is omitted when there is nothing to add. The client maps `message` straight into
its notice strips, so the copy is verbatim from the design spec.

| Code | Status | Raised when |
|---|---|---|
| `UNAUTHENTICATED` | 401 | no cookie, expired cookie, wrong credentials |
| `FORBIDDEN` | 403 | signed in, but the role lacks that write permission |
| `NOT_FOUND` | 404 | unknown id or unknown route |
| `VALIDATION_FAILED` | 422 | zod or Mongoose validation; `details.issues` lists the fields |
| `IN_USE` | 409 | deleting a fabric, thread, machine type or garment still referenced |
| `DUPLICATE` | 409 | style number, fabric name, email, machine code, thread identity |
| `INVALID_TRANSITION` | 409 | an order status move that is not on the allowed path |
| `LAST_ADMIN` | 409 | removing or demoting the last active admin |
| `ADMIN_PERMISSIONS_FIXED` | 409 | any write to the ADMIN permission row |
| `INCOMPLETE_OPERATIONS` | 409 | creating a cone order with an unassigned position |
| `INTERNAL` | 500 | anything unhandled |

---

## Endpoints

Base path `/api`. Everything except `/api/health` and `/api/auth/*` needs the session cookie.
**Permissions gate writes only** — any authenticated user may read any endpoint.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/health` | — |
| `POST` | `/auth/login` · `/auth/logout` | — (login is rate-limited, 10 / 15 min / IP) |
| `GET` | `/auth/me` | signed in |
| `GET` | `/users` · `/role-permissions` | signed in |
| `POST`/`PATCH`/`DELETE` | `/users`, `/users/:id`, `/role-permissions/:role` | `users` |
| `GET` | `/threads?garmentId=` | signed in |
| `POST` | `/threads` | `master` **or** `operations` (inline creation) |
| `PATCH`/`DELETE` | `/threads/:id` | `master` |
| `GET` | `/machine-types` | signed in |
| `POST`/`PATCH`/`DELETE` | `/machine-types…`, `/machine-types/:id/positions/:positionId` | `master` |
| `GET` | `/fabrics` | signed in |
| `POST`/`PATCH`/`DELETE` | `/fabrics…` | `fabrics` |
| `GET` | `/garments` · `/garments/next-style-number` · `/garments/:id` | signed in |
| `POST`/`PATCH`/`DELETE` | `/garments…`, `/garments/:id/duplicate` | `info` |
| `GET` | `/garments/:id/calculation?quantity=&wastagePercent=&roundingMode=` | signed in |
| `GET` | `/garments/:id/operations` | signed in |
| `POST` | `/garments/:id/operations` | `operations` |
| `PATCH` | `/garments/:id/operations/order` | `operations` |
| `PATCH`/`DELETE` | `/operations/:id`, `/operations/:id/threads` | `operations` |
| `GET` | `/orders?status=&q=&page=&limit=` · `/orders/:id` | signed in |
| `POST`/`DELETE` | `/orders`, `/orders/:id`, `/orders/:id/submit` | `orders` |
| `POST` | `/orders/:id/approve` · `/reject` · `/place` | `approve` |

Printing has no endpoints: both sheets render in the browser from `GET /garments/:id` +
`/operations`, or from the order snapshot.

---

## The calculation

`GET /garments/:id/calculation` is the only source of numbers for the garment screen, the
thread-requirement table and both printed documents.

```
positionMetres    = (seamLengthCm / 100) × consumptionRatio × count
operationMetres   = Σ positionMetres over the machine type's positions
threadMetres      = Σ positionMetres grouped by the thread at each position
metresOrder       = threadMetres × quantity
metresWithWastage = metresOrder × (1 + wastagePercent / 100)
rawCones          = metresWithWastage / coneYieldM
cones             = per the order's rounding mode
```

Nothing is rounded between those steps. Metres are rounded to 2 dp for transport and the
cone ceiling carries a 1e-9 float guard; everything else is display formatting in the client.

Rounding modes: `PER_THREAD` (default, `ceil` per thread, sum) · `PER_THREAD_PLUS_SAFETY`
(`+1` per thread) · `ORDER_TOTAL` (sum the raw counts, `ceil` once). The mode is chosen at
order creation, stored on the order and printed on the sheet.

**Cone orders are snapshots.** `POST /orders` freezes identity, quantity, wastage, rounding
mode, `rows`, `lines` and totals. Editing the garment afterwards never changes an order that
already exists.

---

## Tests

```bash
npm test
```

- `src/domain/threadCalculation.test.ts` — all twelve vectors from `CALCULATIONS.md`, the
  string formatter's cases, and the seeded `STY-4471` figures pinned.
- `src/test/api.test.ts` — boots the app against an in-memory single-node replica set, seeds
  it, and walks the acceptance criteria of every phase in `BUILD_ORDER.md`: the error
  envelope, the seven booleans per role, a runtime permission grant taking effect without a
  restart, the `IN_USE` refusals, the twelve-operation reorder, the independent operation
  copy, the incomplete-operations refusal, and snapshot immutability.

See `NOTES.md` for decisions taken, gaps in the specification, and what was deliberately
left out of phase 1.
