# CLAUDE.md — gotc-server

## The one rule that matters most

**All thread and cone arithmetic lives in `src/domain/threadCalculation.ts`.**
No other file — server or client — divides by 100, multiplies by a consumption ratio, applies
wastage, or calls `Math.ceil` on a cone count. The garment screen, the thread-requirement
table, the printed cone order and the register must never be able to disagree. The client
displays what `GET /garments/:id/calculation` and the order snapshot return.

**Cones are not consumption alone.** A cone feeds one position at a time, so every thread also
carries a *threading floor* — one cone per position slot, summed across the line, because the
style is sewn in continuous flow:
`cones = max(ceil(metres ÷ coneYield), threadingCones)`. A two-needle machine needs two cones
of a thread however little it consumes. **Each machine counts once**, however many operations
run on it — repeating a machine down the sequence is the same machine used again, not another
one on the line. Consumption is still summed per operation.
See NOTES.md §"A cone feeds one position".

## Conventions

- TypeScript `strict: true`, plus `noUncheckedIndexedAccess`. No `any` in domain or API code;
  if a type is genuinely unknown, model it (`unknown` + a zod parse).
- Domain vocabulary in code matches the factory's words: garment, style number, operation,
  sequence, machine type, position, ticket, cone yield, wastage, cone order. Never invent
  synonyms ("product", "step", "spool").
- `camelCase` fields, kebab-case URLs, `PascalCase` types.
- Ticket is **inverse weight** — a higher ticket is a finer thread. Keep that comment wherever
  ticket is validated; it prevents "corrections".
- Dates: store and transmit UTC ISO 8601; the client displays `DD MMM YYYY` ("02 Sep 2026").
- No console noise in committed code. The server logs through `pino`.

## Layering (MVCS)

```
routes        paths + guards, nothing else
controllers   zod parse, HTTP status, res.json — no business logic
services      business rules, transactions, DTO shaping — never touch req/res
models        Mongoose schemas, indexes, invariant hooks
domain        pure logic, no database and no framework imports
```

Controllers never touch models directly. Services never touch `req`/`res`.

- Every request body and query is parsed by a zod schema in `src/schemas/`. The inferred types
  are the API contract; `src/dto/api-types.ts` holds every response shape, and the client
  mirrors that file by hand in `client/src/api/types.ts`. Update the mirror in the same
  session you change a schema.
- Errors are thrown as `HttpError` with one of the documented codes and the user-facing
  message from the design spec. `middleware/error.middleware.ts` is the only place that
  formats a response body.
- Multi-document writes (reorder, duplicate garment, order creation, cascade delete) run
  through `withTransaction`.
- Permissions: `requirePermission('operations')` on every write route, reading the cached role
  matrix. Guards gate **writes only** — reads are open to any authenticated user.
- Never trust client-supplied totals, cone counts, sequences or status transitions. Recompute
  or validate server-side, always.
- Copy is final. Take every error message verbatim from the handoff `README.md`; do not
  reword it. Use `requiredString` / `requiredNumber` so a *missing* field produces the same
  sentence as an empty one.
- Tests: `vitest` for the domain module (mandatory, all vectors in `CALCULATIONS.md`),
  `supertest` for route guards and the transition rules.

## What not to build in phase 1

No PDF service (the browser prints), no file uploads, no notifications, no audit log, no
soft-delete UI, no i18n, no mobile layout, no CI, no Docker, no deployment configuration.
Note anything that feels missing in `NOTES.md` rather than building it unasked.
