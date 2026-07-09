# Administrator Guide

> Complete operational guide for KinMarché administrators (L&P managers and operations leads).

---

## Table of Contents

- [Your Role](#your-role)
- [Signing In](#signing-in)
- [Dashboard Overview](#dashboard-overview)
- [Running an Inventory Cycle](#running-an-inventory-cycle)
  - [Step 1 — Prepare the File](#step-1--prepare-the-file)
  - [Step 2 — Upload & Validate](#step-2--upload--validate)
  - [Step 3 — Monitor Submissions](#step-3--monitor-submissions)
  - [Step 4 — Export Results](#step-4--export-results)
- [Managing Deadlines](#managing-deadlines)
- [Granting Store Extensions](#granting-store-extensions)
- [Unlocking a Store Submission](#unlocking-a-store-submission)
- [Managing Stores](#managing-stores)
- [Managing Users](#managing-users)
- [Viewing Analytics](#viewing-analytics)
- [Reports](#reports)
- [Activity Log](#activity-log)
- [Notifications](#notifications)
- [Overriding a Record](#overriding-a-record)

---

## Your Role

As an administrator you have full visibility across the entire store network. Your primary responsibilities are:

1. **Upload** the master inventory file at the start of each counting cycle
2. **Monitor** store submissions and deadline compliance
3. **Investigate** shortages, recurring losses, and high-risk stores
4. **Export** reconciliation reports for finance and L&P leadership

You do not enter stock counts — that is the store manager's responsibility.

---

## Signing In

Navigate to the KinMarché URL and click **Sign In**. Enter your Employee ID and password.

Your dashboard distinguishes you from store managers with a **red navigation bar** across the top. Store managers see a white bar — this visual distinction ensures you know which interface you are in.

---

## Dashboard Overview

The dashboard gives you a real-time snapshot of the current inventory cycle.

### Network Overview header

Shows the active cycle date and key badges:
- **% reported** — what percentage of stores have submitted
- **Store count** — total active stores
- **Deadline** — when submissions are due

### KPI Cards (6 tiles)

| Card | What it shows |
|------|--------------|
| Active Stores | Number of currently active store locations |
| Fully Reported | Stores that have completed and submitted their count |
| Awaiting Submission | Stores that have not yet submitted |
| Shortage Items | Items across all stores where count < book stock |
| Matched Items | Items where count = book stock exactly |
| Excess Items | Items where count > book stock |

### Store Submission Status

A table ranking all stores by shortage rate (worst first). Columns:

- **Store** — name and code
- **Risk** — High Risk (≥20% shortage rate) / Watch (5–19%) / On Track (<5%)
- **Shortage Rate** — bar chart + percentage
- **Shortages** — count of items in shortage; clicking the number filters the Inventory view
- **Top Remark** — the most common remark entered by that store's manager
- **Status** — Submitted / Awaiting / No Data

Row colours: red tint = High Risk, amber tint = Watch.

### Recurring Loss Items

The right panel lists (store, item) pairs that appeared in shortage in 2 or more of the last 4 cycles. These are your priority investigation targets.

---

## Running an Inventory Cycle

### Step 1 — Prepare the File

Export your inventory file from your ERP system (SAP, Sage, Oracle, etc.). The file must be Excel (`.xlsx`, `.xls`) or CSV and include these columns (any of the aliases in the table below are accepted):

| What it is | Accepted column names |
|-----------|----------------------|
| Store identifier | `Plant`, `Plant Code`, `Store Code`, `StoreCode` |
| Item code (SKU) | `Material`, `Material Code`, `SKU` |
| Item description | `Material Description`, `Description`, `Material Name` |
| Book stock quantity | `System Stock`, `System  Stock`, `SYS` |

Click **↓ Download Template** on the Upload page to get a correctly-formatted example.

> **Store codes must match exactly** — including capitalisation. If your ERP uses `2001` but KinMarché has the store as `2001`, they will match. If one has a leading zero and the other does not, they will not.

### Step 2 — Upload & Validate

1. Go to **Admin → Upload**
2. Set the **Inventory Date** — the date this stock count is *for*
3. Optionally set a **Submission Deadline** — the date/time by which all stores must submit
4. Select your file and click **Validate File**
5. Review the preview:
   - **Green rows** — valid, ready to publish
   - **Amber rows** — warnings (e.g. new store code found — it will be auto-created)
   - **Red rows** — errors that will be skipped (e.g. missing item code)
6. If you are happy with the preview, click **Confirm & Publish to Stores**

Store managers will immediately see their items in their **Stock Count** page.

**Duplicate date warning:** If a cycle already exists within ±3 days of the date you selected, a warning appears. Click **Upload anyway** to proceed with the force override.

**New stores:** Any store code in the file that does not exist in KinMarché will be created automatically with a default name of `Store {code}`. Update the name afterwards in **Admin → Stores**.

### Step 3 — Monitor Submissions

Track store progress from:
- **Admin → Dashboard** — network-level scorecard
- **Admin → Cycles** — per-cycle submission counts
- **Notification bell** — live alerts for submissions and deadline approaching

When a store manager submits, you receive an email notification (if SMTP is configured) and the notification bell updates.

### Step 4 — Export Results

Once all (or most) stores have submitted:

- **Admin → Cycles → Export** — full cycle Excel or PDF report
- **Admin → Reports** — filter by store, discrepancy type, status; export to Excel or PDF
- **Admin → Inventory → ↓ Excel / ↓ PDF** — filtered inventory export

---

## Managing Deadlines

### Setting a Cycle Deadline

Set the deadline when you upload, or update it later:

1. Go to **Admin → Cycles**
2. Click the pencil icon next to a cycle's deadline
3. Enter the new date and click **Save**

After the deadline passes:
- Store managers cannot edit or submit (records are locked)
- The dashboard shows overdue stores with a red indicator
- The notification bell shows an overdue alert

To remove a deadline, clear the date field and save.

### What Happens When the Deadline Passes

- The `isLocked` flag is returned as `true` for that cycle
- Store managers see a lock banner: *"Submission locked. The deadline has passed."*
- Existing submitted records remain accessible (read-only)
- You can extend the deadline globally or grant per-store extensions

---

## Granting Store Extensions

If one store needs more time without extending the deadline for all stores:

1. Go to **Admin → Cycles**
2. Find the cycle and click **Grant Extension**
3. Select the store
4. Set a new deadline for that store only
5. Optionally add a note (e.g., "Public holiday delayed counting")
6. Click **Grant**

The store manager will see their personal deadline instead of the cycle's global deadline. The extension can be updated by granting again with a different date.

---

## Unlocking a Store Submission

If a store manager submits incorrect counts and needs to recount:

1. Go to **Admin → Cycles**
2. Find the cycle and click **Unlock Store**
3. Select the store to unlock
4. Click **Unlock**

This resets all that store's `SUBMITTED` records back to `PENDING` and clears their physical count values. The store manager can then re-enter all counts and submit again.

> ⚠️ This action is logged in the Activity Log. All previous count data for that store in this cycle is erased.

---

## Managing Stores

Go to **Admin → Stores**.

### Create a Store

Click **+ New Store**, enter:
- **Store Code** — must match your ERP (case-sensitive)
- **Store Name** — human-readable name

### Edit a Store

Click the pencil icon to change the store name or toggle active/inactive status.

**Inactive stores** do not appear on the dashboard scorecard but their historical data is preserved.

### Delete a Store

Stores with inventory records **cannot be deleted** — deactivate them instead. Stores with no records can be deleted cleanly.

For stores with records, use **Force Delete** — this permanently deletes the store and all its inventory history. This cannot be undone.

---

## Managing Users

Go to **Admin → Users**.

### Create a Store Manager

Click **+ New User**:
- **Employee ID** — used for login (must be unique)
- **Full Name**
- **Password** — share securely; the manager should change it on first login
- **Role** — `Store Manager`
- **Assigned Store** — select from the dropdown

### Create an Admin

Same as above but set Role to `Admin` and leave the store unassigned.

### Edit a User

Click the pencil icon to update name, email, phone, password, store assignment, or active status.

> Setting a user to **Inactive** immediately invalidates their session — they cannot log in until reactivated.

### Delete a User

A user can only be deleted if:
- It is not your own account
- They are not the last remaining admin

Deleting a user reassigns their uploaded batches and deadline extensions to you, then nullifies their audit log entries.

---

## Viewing Analytics

Go to **Admin → Analytics**.

The trend chart shows shortage rate over the last 6 cycles per store (configurable). Use this to identify:

- Stores with **worsening trends** (shortage rate increasing over time)
- Stores that improved after intervention
- Items that consistently appear in shortage across multiple stores

---

## Reports

Go to **Admin → Reports**.

### Reconciliation Report

Filters available:
- **Store** — narrow to one store or view all
- **Status** — Pending, Submitted, or All
- **Variance** — Shortage, Surplus, Matched, or All
- **Include Inactive Stores** — toggle to include closed/inactive stores

Click **Load Report** to view the filtered data, then **Download Excel** or **Download PDF**.

---

## Activity Log

Go to **Admin → Activity Log**.

This is an immutable record of every significant action in the system:
- Logins
- Store and user creation/deletion
- File uploads
- Inventory submissions
- Admin overrides
- Deadline changes and extensions

Filter by action type (e.g., show only `SUBMIT_INVENTORY` events) or use the default view to see the most recent 100 actions.

Click **Export** to download the full log as Excel.

---

## Notifications

The **bell icon** in the top navigation bar shows alerts without requiring you to refresh the dashboard. Alerts update every 60 seconds.

| Alert type | What it means |
|-----------|--------------|
| 🟢 Stores submitted | N stores sent in their counts in the last 24 hours |
| 🟡 Deadline approaching | N stores are still pending with less than 48 hours to go |
| 🔴 Overdue | The deadline has passed and N stores have not submitted |

Clicking an alert navigates you to the relevant page (Cycles or Inventory).

---

## Overriding a Record

Admins can correct any inventory record directly from **Admin → Inventory**:

1. Find the record using the filters
2. Click the **Override** button on that row
3. Modify:
   - Physical stock quantity
   - Variance category
   - Issue detail (remarks)
   - Status (set to SUBMITTED or reset to PENDING)
4. Click **Save Override**

All overrides are logged in the Activity Log with before/after values.

> Use overrides sparingly — they bypass the normal store manager workflow. If a store needs to recount, use **Unlock Store** instead.
