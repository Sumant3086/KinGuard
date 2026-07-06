# KinMarché — Loss & Prevention Platform

> Retail shrinkage costs the industry billions every year. KinMarché gives operations teams a single place to catch it, track it, and act on it — across every store, every cycle.

---

## The Problem We Solve

Multi-store retailers struggle with inventory reconciliation because it's manual, fragmented, and slow. Store managers use spreadsheets. Results arrive late. Discrepancies go unnoticed until they become losses. Nobody sees the full picture until it's too late.

---

## What KinMarché Does

KinMarché is a centralised Loss & Prevention reconciliation platform built for multi-store retail operations.

An administrator uploads one inventory file. The platform automatically splits it by store, assigns each record to the right manager, and collects reconciliation data in real time. Discrepancies are calculated instantly. Risk is surfaced before it compounds.

---

## Who Uses It

**Operations / L&P Administrators**
Upload inventory files, set submission deadlines, monitor store compliance, and download consolidated reports — all from one dashboard.

**Store Managers**
Log in, enter their sold quantities and remarks, and submit. Nothing outside their own store is visible to them.

---

## Core Features

**For the Administrator**
- Upload one master Excel or CSV file for all stores — records separate automatically by Store Code
- Set a submission deadline per cycle; stores that miss it are locked automatically
- Store Risk Scorecard — every store ranked as High Risk, Watch, or Healthy based on shortage rate
- Shrinkage Hotspot panel — recurring (store, item) pairs with shortages across multiple cycles
- Repeat Discrepancy flags — items that shortage in consecutive batches are automatically highlighted
- Full inventory view with filters by store, status, batch, and discrepancy type
- Export any filtered view to Excel in one click

**For the Store Manager**
- Sees only their own store's data — enforced at the server level, not just the UI
- Live progress bar showing how many items have been entered vs. remaining
- Quantities and remarks save automatically as they type — no submit-per-row required
- Per-row Save button for immediate saves when needed
- Diff column updates instantly as quantities are entered — no waiting for the server
- Locked view with a clear message once the submission deadline passes
- Post-submission summary showing matched, shortage, and excess counts

---

## How a Reconciliation Cycle Works

```
1. Admin uploads master file
          ↓
2. Platform splits records by Store Code
          ↓
3. Store Managers enter Sold quantities + Remarks
          ↓
4. Platform calculates  Diff = Sold − SYS  per item
          ↓
5. Manager reviews and submits their batch
          ↓
6. Admin sees full network picture — risk scores, hotspots, export
```

---

## Discrepancy Logic

| SYS | Sold | Diff | Result   |
|-----|------|------|----------|
| 100 | 100  |   0  | Matched  |
| 100 |  90  | −10  | Shortage |
| 100 | 110  | +10  | Excess   |

The platform is the single source of truth for every Diff value. Nothing is calculated client-side and trusted.

---

## Demo Access

| Role            | Employee ID | Password      | Store      |
|-----------------|-------------|---------------|------------|
| Administrator   | `ADMIN001`  | `Password123!` | All stores |
| Store Manager   | `MGR2036`   | `Password123!` | Store 2036 |
| Store Manager   | `MGR2007`   | `Password123!` | Store 2007 |
| Store Manager   | `MGR2024`   | `Password123!` | Store 2024 |
| Store Manager   | `MGR2013`   | `Password123!` | Store 2013 |

---

## Data Security & Store Isolation

Every store manager's session is cryptographically bound to their store. It is architecturally impossible for one store manager to view, edit, or submit data belonging to another store — regardless of what they send to the server.

All data in transit is validated, parameterised, and rate-limited. File uploads are type-checked and size-capped before processing begins.

---

*KinMarché — built for KinGuard Loss & Prevention operations, Kinshasa, DRC.*
