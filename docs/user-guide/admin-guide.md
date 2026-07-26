# Administrator Guide

Complete guide for KinMarche administrators — L&P managers and operations leads.

## Your Role

As an administrator you have full visibility across the entire store network. Your main responsibilities are:

1. Upload the master inventory file at the start of each counting cycle
2. Monitor store submissions and deadline compliance
3. Investigate shortages, recurring losses, and high-risk stores
4. Export reconciliation reports for finance and L&P leadership

You do not enter stock counts — that is the store manager's responsibility.

## Signing In

Navigate to the KinMarche URL and click **Sign In**. Enter your Employee ID and password.

Your dashboard has a **red navigation bar** across the top. Store managers see a white bar — this visual difference makes it easy to know which role you are logged in as.

## Dashboard Overview

The dashboard gives you a real-time snapshot of the current inventory cycle.

### Network Overview header

Shows the active cycle date and key badges:
- **% reported** — what percentage of stores have submitted
- **Store count** — total active stores
- **Deadline** — when submissions are due

### KPI Cards

| Card | What it shows |
|---|---|
| Active Stores | Number of currently active store locations |
| Fully Reported | Stores that have completed and submitted their count |
| Awaiting Submission | Stores that have not yet submitted |
| Shortage Items | Items where count is below book stock |
| Matched Items | Items where count matches book stock exactly |
| Excess Items | Items where count is above book stock |

### Store Submission Status

A table ranking all stores by shortage rate, worst first.

- **Risk** — High Risk (20%+ shortage rate) / Watch (5-19%) / On Track (under 5%)
- **Shortage Rate** — bar chart and percentage
- **Top Remark** — the most common remark entered by that store's manager
- **Status** — Submitted / Awaiting / No Data

Red rows = High Risk. Amber rows = Watch.

### Recurring Loss Items

Lists store and item pairs that appeared in shortage in 2 or more of the last 4 cycles. These are your priority investigation targets.

## Running an Inventory Cycle

### Step 1 — Prepare the File

Export your inventory file from your ERP (SAP, Sage, Oracle, etc.). The file must be Excel (.xlsx, .xls) or CSV. Accepted column names:

| What it is | Accepted column names |
|---|---|
| Store identifier | Plant, Plant Code, Store Code |
| Item code | Material, Material Code, SKU |
| Item description | Material Description, Description |
| Book stock quantity | System Stock, SYS |

Click **Download Template** on the Upload page for a correctly formatted example.

Store codes must match exactly — including capitalisation. If your ERP uses `2001` and KinMarche has `2001`, they match. A missing leading zero means they do not.

### Step 2 — Upload and Validate

1. Go to **Admin -> Upload**
2. Set the **Inventory Date** — the date this stock count is for
3. Optionally set a **Submission Deadline**
4. Select your file and click **Validate & Preview**
5. Review the preview — green = valid, amber = warning (new store will be auto-created), red = error (row will be skipped)
6. Click **Confirm & Publish**

Store managers will immediately see their items in their Inventory Count page.

If a cycle already exists within 3 days of the selected date, a warning appears. Click **Upload anyway** to proceed.

Any store code in the file that does not exist in KinMarche is created automatically. Update the store name afterwards in Admin -> Stores.

### Step 3 — Monitor Submissions

- **Admin -> Dashboard** — network-level scorecard
- **Admin -> Cycles** — per-cycle submission counts
- **Notification bell** — live alerts for submissions and approaching deadlines

### Step 4 — Export Results

- **Admin -> Cycles -> Export** — full cycle Excel or PDF
- **Admin -> Reports** — filter by store, discrepancy type, status; export to Excel or PDF
- **Admin -> Inventory -> Excel / PDF** — filtered inventory export

## Managing Deadlines

Set the deadline when uploading, or update it later:

1. Go to **Admin -> Cycles**
2. Click the pencil icon next to a cycle's deadline
3. Enter the new date and click **Save**

After the deadline passes, store managers cannot edit or submit. The dashboard shows overdue stores in red. To remove a deadline, clear the date field and save.

## Granting Store Extensions

To give one store more time without extending the deadline for everyone:

1. Go to **Admin -> Cycles**
2. Find the cycle and click **Extend Store**
3. Select the store and set a new deadline for that store only
4. Optionally add a note and click **Grant Extension**

The extension can be updated by granting again with a different date.

## Unlocking a Store Submission

If a store manager submitted incorrect counts and needs to recount:

1. Go to **Admin -> Cycles**
2. Find the cycle and click **Unlock Store**
3. Select the store and click **Unlock & Reset**

This resets all that store's submitted records back to pending and clears their physical count values. The store manager can then recount and submit again. This action is logged in the Activity Log and all previous count data for that store in this cycle is erased.

## Managing Stores

Go to **Admin -> Stores**.

**Create a store:** Click + Add Store. Enter the Store Code (must match your ERP exactly, case-sensitive) and Store Name.

**Edit a store:** Click the pencil icon to change the name or toggle active/inactive. Inactive stores do not appear on the dashboard scorecard but their historical data is preserved.

**Delete a store:** Stores with inventory records cannot be deleted — deactivate them instead. Stores with no records can be deleted. Use Force Delete to permanently delete a store and all its history — this cannot be undone.

## Managing Users

Go to **Admin -> Users**.

**Create a store manager:** Click + Add User. Fill in Employee ID, Full Name, Password, set Role to Store Manager, and select their Assigned Store.

**Create an admin:** Same as above but set Role to Admin and leave the store unassigned.

**Edit a user:** Click the pencil icon to update name, email, phone, password, store assignment, or active status. Setting a user to Inactive immediately prevents them from logging in.

**Delete a user:** You cannot delete your own account or the last admin. Deleting a user reassigns their uploaded batches and deadline extensions to you.

## Scheduling Recurring Cycles

Instead of manually uploading a file for each cycle, you can set up a recurring schedule.

Go to **Admin -> Schedules** and click **+ New Schedule**.

Fill in:
- **Name** — something descriptive, e.g. "Monthly Physical Count"
- **Frequency** — Weekly, Monthly, or Quarterly
- **Day** — which day of the month (or week) the cycle should start
- **Submission Window** — how many days store managers have to submit (sets the deadline automatically)

Once active, the system creates a new inventory cycle automatically at the scheduled time. You still need to upload the master inventory file to that cycle before store managers can start counting.

To pause a schedule without deleting it, click the status badge and toggle it to **Paused**.

## Viewing Analytics

Go to **Admin -> Analytics**.

### Shortage Rate Trends

The trend chart shows shortage rate over the last 8 cycles per store. Use it to:
- Find stores with worsening trends
- Confirm that an intervention worked
- Identify items that consistently appear in shortage

### Risk Intelligence

Click **Load Risk Scores** to see a composite risk score (0–100) for every store. The score combines:
- Shortage rate (how many items are short, as a percentage)
- Repeat rate (what percentage of shortages are recurring from prior cycles)
- Category severity (Theft counts more than a Miscount)
- Trend direction (getting worse increases the score)

Each store also shows a **percentile** — if a store is at the 90th percentile, it is riskier than 90% of your other stores.

Below the store table you will see the **Top 10 At-Risk Items** — specific materials that appear in shortage frequently, across many stores, or in high-severity categories.

### Year-over-Year Comparison

Enter a year in the **Compare against year** field and click **Compare**. The system shows current-period shortage rates alongside the same period last year, with an average delta at the bottom.

## Reports

Go to **Admin -> Reports**.

### Reconciliation Report

Filter by store, status (Pending / Submitted / All), variance type (Shortage / Surplus / Matched / All), and whether to include inactive stores. Click **Load Report**, then **Download Excel** or **Download PDF**.

### Executive Summary

Click **Executive Summary** in the page header to download a one-page PDF summarising the latest cycle for management:
- Four key numbers: network shortage rate, shortage item count, matched count, stores counted
- Top 5 risk stores with their rates
- Top 5 shrinkage categories
- Comparison with the prior cycle (better / worse / flat)

## Activity Log

Go to **Admin -> Activity Log**.

Immutable record of every significant action: logins, store and user changes, file uploads, inventory submissions, admin overrides, deadline changes. Filter by action type or view the most recent 100. Click **Export** to download as Excel.

Audit records are protected at the database level — they can never be deleted, even if a cycle is deleted.

## Automatic Escalation Notifications

You do not need to manually chase overdue stores. The system escalates automatically:

1. **When the deadline passes** — Area Managers for overdue stores receive an email listing their pending stores
2. **24 hours after the deadline** — Administrators receive an urgent email with all still-pending stores

This runs in the background automatically. No action needed.

## Notifications

The bell icon in the top navigation bar shows alerts. Updates every 60 seconds.

| Alert | What it means |
|---|---|
| Green — Stores approved by AM | Area Managers have reviewed and approved these stores — they are ready for your final check |
| Yellow — Deadline approaching | N stores are still pending with under 48 hours to go |
| Red — Overdue | The deadline passed and N stores have not submitted |

Clicking an alert navigates to the relevant page.

## Overriding a Record

1. Go to **Admin -> Inventory**
2. Find the record using the filters
3. Click **Override** on that row
4. Modify the physical stock quantity, category, issue detail, or status
5. Click **Apply Override**

All overrides are logged in the Activity Log with before and after values. Use overrides sparingly — if a store needs to recount, use Unlock Store instead.
