# NOTES — decisions, gaps and things deliberately not built

Per `CLAUDE.md`: anything that felt missing is noted here rather than built unasked.

---

## Where the handoff documents disagree with each other

### 1. The worked figures in `CALCULATIONS.md` and `API.md` are not the seed's figures

`CALCULATIONS.md` §Step 5 shows a table with **160 Gramax at 53.92 m/garment**. Recomputed
from the seeded operations, 53.92 m/garment is **120 Surfilor** (the OL-4 loopers over 320 cm
plus the FL-2 upper looper over 194 cm). Gramax comes to 52.65.

`API.md`'s sample calculation payload shows `totalCones: 210` and `totalMetres: 1128441`.
Those are test vector 6's synthetic numbers (144.94 / 60.20 / 3.10), not the seed's.

`CALCULATIONS.md` says so itself: *"Recompute the full table from the seed at test time
rather than trusting these figures."* So the **twelve pinned vectors are the contract** and
they all pass. The seed's own answer for `STY-4471` at 12,000 pcs / 12% is pinned separately
in `threadCalculation.test.ts`:

| Thread | m/garment | + wastage | raw | cones |
|---|---|---|---|---|
| 120 Surfilor | 53.92 | 724,684.80 | 144.94 | **145** |
| 160 Gramax | 52.65 | 707,616.00 | 141.52 | **142** |
| 120 Epic | 0.50 | 6,746.88 | 1.35 | **2** |
| **Order total** | | **1,439,047.68 m** | | **289** |

If the intent was for the seed to produce 210, the seed data needs changing — not the
arithmetic. Flagging rather than guessing.

### 2. Looper labels: the prototype contradicts itself, the README wins

`prototype/Garment System.dc.html` labels any looper `LOOPER` on screen (line 1477) but uses
`UPPER LOOPER` / `LOWER LOOPER` when the machine has both on the printed sheet (line 1498).
`CALCULATIONS.md` rule 3 states the "machine has both" rule and says *"Implement this once
… and use it for both the screen and the snapshot rows."* README wins, so both paths use the
hasBoth rule. On the seeded data this changes nothing visible: OL-4's two loopers always
carry the same thread and therefore collapse to one `LOOPER` entry anyway.

### 3. There is no documented way to create a **Draft** order

`DATA_MODEL.md` gives `coneorders.status` the default `'Pending approval'`, and `API.md`'s
`POST /orders` body has no status field. But `POST /orders/:id/submit` exists for
`Draft → Pending approval`. As specified, that endpoint can only ever act on the seeded
`TCO-0153`. Implemented exactly as documented; **not** extended with a `status` field on the
create body. If project managers should be able to park a draft, that field is the change.

---

## Implementation decisions worth knowing

### Zod parsing lives in the controllers

`API.md` says "every body and query parsed by zod in middleware"; `CLAUDE.md` §Server says
"controllers (zod parse, HTTP shape)". The controllers parse, which keeps the inferred types
flowing into the services with no casts. The `ZodError` still reaches the one error
middleware and leaves as the documented `422 VALIDATION_FAILED` envelope either way.

### Validation copy fires on missing *and* empty fields

Zod's default message for an absent key is `"Required"`, which would leak past the README's
final copy. `schemas/common.schema.ts` exports `requiredString` / `requiredNumber`, which set
`required_error` and `invalid_type_error` to the same sentence as the `.min()` message. The
new-garment messages are also declared in the README's documented order, because zod reports
issues in schema key order and the client shows one at a time.

### Transactions need a replica set

`utils/transaction.ts` probes once. On a replica set (Atlas, or a local single-node replica
set) reorder / duplicate / order creation / cascade delete are genuinely atomic. On a plain
standalone `mongod`, MongoDB refuses the transaction *before any write is applied*; the
helper logs a warning and replays the callback without a session. The integration suite runs
against an in-memory single-node replica set, so the transactional paths are exercised for
real.

### `operationMetres` counts every position, assigned or not

It is what the machine consumes at that seam length, which is what the expanded panel's
"m per garment" column and "Operation total" line show. The thread roll-up only counts
positions that actually carry a thread — an unassigned position contributes nothing and
makes the operation incomplete. Both behaviours match the prototype and are covered by
vector 7.

### `ORDER_TOTAL` lines do not sum to the total

By design. Per-thread `cones` is always `ceil` of that thread's own raw count — you cannot
buy a fraction of a cone of one specific thread. Only `totalCones` follows the mode. That
difference (210 vs 209 in vector 6) is the reason the mode is stored on the order and
printed on the sheet.

### A float guard at the cone ceiling

`Math.ceil(raw - 1e-9)`. Intermediate metres are never rounded, but without this a raw count
of exactly 1 can arrive as `1.0000000000000002` and buy a second cone. 1e-9 of a cone is
about five micrometres of thread.

### `approvedBy` also records the rejecter

`DATA_MODEL.md` gives the order one decision actor. Rejection writes the same
`approvedBy` / `approvedByName` / `approvedAt` fields; the status tells the sheet whether to
read "Approved by" or "Rejected by". Matches the prototype's seeded `TCO-0136`.

### A garment status is a workflow, not a field

`DATA_MODEL.md` gives `garments.status` three values but no rule for moving between them.
It now moves the way a cone order does: `GARMENT_TRANSITIONS` in `constants/domain.ts` is the
only statement of what a status may become, `POST /garments/:id/approve` and
`POST /garments/:id/status` are the only ways to move one, and both carry
`requirePermission('approve')` — the existing seventh key, not an eighth. Approving records
`approvedBy` / `approvedByName` / `approvedAt`; reopening clears all three together.

`status` was therefore **removed from `PATCH /garments/:id`**. Leaving it would have given
anyone with `info` a second, unguarded way to approve a style, and one that wrote no approval
record — the two paths could disagree, which is the thing this repository is built to prevent.
Creation still accepts a status, unchanged: a style may be entered as already approved, and it
then carries no approval record until someone approves it. The seeded `STY-4471` has one
because the seed writes it explicitly (R. Fernando, 15 Aug 2026), the same way a seeded order
carries its decision date. No screen sent `status` on a patch, so the client needed nothing
beyond the mirror. If styles ever need importing with their approvers, that is a create-body
field, not a patch.

### `threadSummary` is empty when no machine type is selected

The prototype renders the string `"No machine type selected"`. That is UI copy, so the API
returns `''` and the client supplies the sentence.

### Fields added beyond `API.md`

Additive only — nothing documented was dropped. Mirror them in `client/src/api/types.ts`:

| Endpoint | Extra | Why |
|---|---|---|
| `GET /users` | `roleLabel`, `active` | the role select and the removal guard |
| `GET /role-permissions` | `roleLabel`, `userCount` | the matrix header shows user counts per group |
| `GET /threads` | `active` | `active: false` is the alternative to deleting an in-use thread |
| `GET /machine-types` | `active` | same |
| calculation `machineTypesUsed[]` | `code` | the legend under the operations heading is by code |
| `GET /orders` | `page`, `limit` | the query accepts them, so the response echoes them |
| order `lines[]` | `rawCones` | the sheet shows the working, and it must match the screen |
| `GET /orders/:id` | `maxCells` | the printed table's THREAD VARIETY column count |
| `POST /garments` | `operationsCopied` | the success notice says "with n operations copied" |
| `POST /garments/:id/duplicate` | `operationsCopied`, `sourceStyleNumber` | the duplication notice |
| `GET /garments/:id/operations` | `machineTypeName/Code/Colour`, `positions[]` | so the expanded panel needs no extra call, as `API.md` requires |
| `GET /garments/:id` | `approvedBy`, `approvedByName`, `approvedAt` | the style's approval record — the sub-header reads "Approved by <name> · <date>" |
| `GET /garments` | `approvedByName` | the library shows the approver without a second call |

### Pagination

**Every list endpoint pages, in one envelope** — `{ items, total, page, limit }`:
`/garments`, `/threads`, `/machine-types`, `/fabrics`, `/users`, `/orders`. Default
`limit` is 25, capped at 200 (over the cap is a `422`); `?q=` searches server-side on each.
`/garments` adds `operationTotal` so the header can read "<n> styles · <n> operations" for the
whole filter rather than the page; `/orders` adds its `counts` and `totals` as before.

This closes README §"Known prototype shortcuts" 7. The 200 cap exists so the screens that
genuinely need a whole set — the thread and machine selects on an operation, the fabric picker
on the new-garment screen, the copy-operations-from select — can ask for it in one request
instead of walking pages.

Costing is scoped to the page: `listGarments` only loads operations for the garments it is
about to return, so the work no longer grows with the size of the library.

---

## Not built in phase 1 (per `CLAUDE.md`)

No PDF service, file uploads, notifications, audit log, soft-delete UI, i18n, mobile layout,
CI, Docker or deployment configuration. No `git init` — the repositories are yours to create.

Also deliberately absent, and worth a ticket when they matter:

- **Consumption-ratio history.** Changing a ratio silently changes every past calculation on
  that machine type. Orders are snapshots so existing paper is safe, but there is no record
  of who changed a ratio or when. `DATA_MODEL.md` names this as a future audit requirement.
- **Replacing a machine type's whole `positions` array** mints new position ids, so every
  operation on that machine loses its thread map. The service does this deliberately and
  clears the maps rather than leaving dangling keys. The single-position ratio endpoint
  (`PATCH /machine-types/:id/positions/:positionId`), which the UI actually uses, does not.
- **Rate limiting** is on `POST /auth/login` only.

## A cone feeds one position — the threading floor

`CALCULATIONS.md` defines cones purely as consumption: `cones = ceil(metres ÷ coneYield)`.
That is incomplete, and the factory corrected it.

**A cone can only feed one position at a time.** A Double Needle Flatlock running 120 Epic on
both needles needs **two cones of Epic standing on the machine**, even when the whole job
consumes a third of one cone. The order has to cover the threads that are physically mounted,
not just the thread that gets used up.

So each thread now carries a second requirement:

```
threadingCones = Σ position.count, over every distinct machine slot carrying that thread
cones          = max(ceil(metresWithWastage ÷ coneYieldM), threadingCones)
```

The style is sewn in **continuous flow** — every machine on the line is threaded at the same
time — so the floor is the *sum* of the position slots across the line, not the largest single
machine. Two different machines each running Epic on two needles is four cones, not two.

**But a machine is counted once, however many operations run on it.** A sequence re-uses the
same machine constantly: four of STY-4471's twelve operations are on the one Four Thread
Overlock, and operations 5 and 6 are both on the one lock stitch. That is the same machine
being used again, not four overlocks standing on the line, so its cones are counted once.
Counting per operation inflated the order for every repeated machine — the seeded style's
Epic asked for 6 cones where the line only mounts 4.

The dedupe key is the position id, which belongs to exactly one machine type, and the set is
kept per thread. So the same machine **re-threaded** with a different thread at that position
in a later operation is counted again: one cone still feeds one position, and Gramax cannot
be fed from Epic's cone.

The factory's worked example, which is pinned as a test:

| Thread | Consumption | Threaded at | Cones |
|---|---|---|---|
| 120 Epic | 896 m = 0.36 cones | 2 needles | **2** |
| 120 Gramax | 717 m = 0.29 cones | 1 upper looper | **1** |
| 120 Surfilor | 717 m = 0.29 cones | 1 lower looper | **1** |

Four cones on one machine, from a job that consumes less than one.

### What this does and does not change

- **Long runs are unaffected.** Consumption is almost always the larger number; the floor only
  binds on samples and short runs, which is exactly where the old figure was wrong.
- **`applyRounding` takes the floor as an optional third argument**, defaulting to none, so
  every pure-arithmetic vector in `CALCULATIONS.md` still asserts exactly what it did.
- **`PER_THREAD_PLUS_SAFETY`** adds its spare cone on top of whichever requirement won.
- **`ORDER_TOTAL`** may pool interchangeable threads, but its total can never fall below the
  number of cones standing on the line.
- **A seam length of zero contributes nothing.** An operation with no seam length has not been
  filled in — the screen shows "must be > 0" — and a machine that sews nothing is not on the
  line. Without that guard an empty draft row would demand a cone order. This is what keeps
  test vector 9 ("zero seam length yields 0 metres") at zero cones.
- **Consumption is not deduped.** Only the threading floor counts a machine once. Every
  operation's metres are still summed, repeated machine or not — a machine sewing five seams
  eats five seams' worth of thread.
- **Existing order snapshots are untouched.** They are frozen by design; `threadingCones`
  defaults to 0 on records written before this rule existed.

The thread-requirement table says which rule decided each number, because
`0.09 → 2 cones` looks like an arithmetic bug otherwise:

```
5 m ÷ 50 m = 0.09 → 2 cones · 2 positions threaded at once
```
