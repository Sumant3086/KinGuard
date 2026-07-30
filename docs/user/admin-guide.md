# Administrator Guide

Complete guide for KinMarché administrators — L&P managers and operations leads.

## Your Role

As an administrator you have full visibility across the entire store network. Your main responsibilities are:

1. Upload the master inventory file at the start of each counting cycle
2. Monitor store submissions and deadline compliance
3. Investigate shortages, recurring losses, and high-risk stores
4. Export reconciliation reports for finance and L&P leadership

You do not enter stock counts — that is the store manager's responsibility.

**Book stock and the blank column.** The System Stock column in your uploaded file may be left empty — the downloadable template ships that way. An empty cell is stored as blank, not as 0, and the store manager fills it in alongside their physical count. A cell containing an explicit `0` is kept as a real figure of zero.

Once a store submits, the system quantity locks for that store along with everything else, so the baseline a shrinkage figure is measured against cannot be moved after the fact by the party being audited. Before submission it is editable by the store; at any time it is editable by you through the Override screen.

## Signing In

Navigate to the KinMarché URL and click **Sign In**. Enter your Employee ID and password.

All roles share the same crimson navigation bar; the accent line along its bottom edge is **green** for administrators (blue for Area Managers, teal for store managers). The page content is colour-tiered the same way, so a screenshot alone tells you which role produced it.

KinMarché is available in English and French — switch with the language selector in the navigation bar.

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

Export your inventory file from your ERP (SAP, Sage, Oracle, etc.). The file must be Excel (.xlsx, .xls) or CSV. Column headers are matched by name, in any order, and several spellings are accepted for each:

| What it is | Accepted column names | Required |
|---|---|---|
| Store identifier | Plant, Plant Code, Store Code, Store, StoreCode, store_code | Yes |
| Item code | Material, Material Code, MaterialCode, SKU, material_code | Yes |
| Item description | Material Description, Material Name, Description, material_name | Yes |
| Book stock quantity | System Stock, System Quantity, SYS, QTY, system_quantity | No — blank stays blank for the store to fill in |
| Opening remark | Remarks, Remark, Note | No |

Upper-case and lower-case variants of these headers are all recognised.

**Blank book stock.** Leaving the System Stock column empty — or omitting it entirely — is supported and is what the downloadable template does. Those rows arrive at the store with the figure shown as a dash rather than 0, and the store manager enters it next to their physical count. A cell containing `0` is treated as a real figure of zero, not as a blank, so you can still state "the book says none" when that is what you mean.

Click **Download Template** on the Upload page for a correctly formatted example.

**Matching store codes.** Codes are compared after trimming spaces and converting to upper case, so `2001a`, `2001A`, and ` 2001A ` are all the same store. What still has to match exactly is everything else: `02001` and `2001` are different stores, and so are `2001-A` and `2001A`. Check leading zeros and separators before you upload.

**Rows that fail validation are skipped, not fatal.** A row is rejected for a missing plant code, a missing material code, a missing description, or a system quantity that is negative or not a number; the rest of the file still loads and the preview lists every rejected row with its reason. If the same plant and material appear twice in one file, the repeat is silently ignored rather than creating a duplicate. If *every* row fails, the cycle is not created at all and you get an error instead of an empty cycle.

### Step 2 — Upload and Validate

1. Go to **Admin -> Upload**
2. Set the **Inventory Date** — the date this stock count is for
3. Optionally set a **Submission Deadline**
4. Select your file and click **Validate & Preview**
5. Review the preview — green = valid, amber = warning (new store will be auto-created), red = error (row will be skipped)
6. Click **Confirm & Publish**

Store managers will immediately see their items in their Inventory Count page.

If a cycle already exists within 3 days of the selected date, a warning appears. Click **Upload anyway** to proceed.

**Unknown store codes are created for you.** Any plant code in the file that does not already exist is created as a new store named `Store <code>`, along with an inactive placeholder manager account (`MGR<code>`) awaiting your approval in User Management. Rename the store in **Admin -> Stores** and activate or replace the placeholder account in **Admin -> Users**.

This auto-creation is capped at **50 new stores per upload**. A file with more unknown codes than that is rejected outright, with the first of the unrecognised codes listed — that many surprises almost always means a wrong column or a wrong file, not fifty genuinely new branches. Create the stores manually and re-upload.

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

## Closing and Deleting a Cycle

Both actions live on **Admin -> Cycles**.

**Close a cycle** when counting is finished and you want the numbers frozen for reporting. Stores can no longer edit or submit; the cycle still appears everywhere it did before.

**Delete a cycle** when it should never have existed — a wrong date, a wrong file, a duplicate. Deleting hides the cycle from every dashboard, report, export, and analytics figure for all three roles immediately. The underlying records are not erased: they are marked deleted and kept, so a mistaken deletion can be undone by a database administrator. The Activity Log entries are never touched at all.

Either action takes effect for store managers and Area Managers within a few seconds — their dashboards and notification bells are refreshed as part of the change, not left showing a cycle that no longer exists.

## Managing Stores

Go to **Admin -> Stores**.

**Create a store:** Click + Add Store. Enter the Store Code and Store Name. The code is saved in upper case, so capitalisation does not have to match your ERP — but leading zeros and separators do.

**Edit a store:** Click the pencil icon to change the name or toggle active/inactive. Inactive stores do not appear on the dashboard scorecard but their historical data is preserved.

**Delete a store:** Stores with inventory records cannot be deleted — deactivate them instead. Stores with no records can be deleted. Use Force Delete to permanently delete a store and all its history — this cannot be undone.

## Managing Users

Go to **Admin -> Users**.

**Create a store manager:** Click + Add User. Fill in Employee ID, Full Name, Password, set Role to Store Manager, and select their Assigned Store. A store manager must have a store; the form will not save without one.

**Create an admin:** Same as above but set Role to Admin. Admins are never tied to a store — the store field is rejected for this role.

**Create an Area Manager:** Set Role to Area Manager, then pick the stores they will review from the store list on the form. Area Managers are not tied to a single store either; instead they hold a set of assigned stores, and they can see and review exactly those.

**Edit a user:** Click the pencil icon to update name, email, phone, password, store assignment, or active status. The role itself cannot be changed after creation — create a new account instead. Setting a user to Inactive immediately prevents them from logging in and cuts off any session they already have within about 30 seconds.

**Filling in an email address matters.** Deadline reminders, submission confirmations, and escalation notices all go to the address on the user record. A user with no email is simply skipped by every notification.

**Delete a user:** You cannot delete your own account or the last remaining admin. Deleting a user reassigns their uploaded cycles and deadline extensions to you, so no history is lost.

### Reassigning an Area Manager's stores

Open the Area Manager in **Admin -> Users** and adjust the selected stores, or use the store assignment control on **Admin -> Stores**.

The store selection is **the complete list, not a list of additions**. Whatever is ticked when you save becomes that Area Manager's entire portfolio — any store you untick is unassigned, and any store left out is unassigned too. Saving with nothing selected removes all of their stores. The confirmation tells you how many stores were assigned and how many were unassigned, and both numbers are written to the Activity Log.

### Creating accounts for plants that have none

If you have just uploaded a cycle that auto-created new stores, those stores have no manager and nobody can count them.

**Admin -> Users** flags every active plant with no user account at all, and offers to create an account for each of them in one action. Each account is created with the Employee ID `MGR` followed by the plant code (plant `2001A` becomes `MGR2001A`), a name you can override, and a randomly generated temporary password.

The temporary passwords are shown **once**, on the confirmation screen. Copy them before you leave the page and hand them out securely — they are hashed in the database and cannot be retrieved afterwards. Every one of these accounts is forced to set its own password at first sign-in.

Plants whose `MGR` Employee ID is already taken are skipped and listed back to you rather than overwriting the existing account.

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
4. Modify the system stock, the physical stock quantity, the category, the issue detail, or the status
5. Click **Apply Override**

You can override the book stock, the physical count, the shrinkage category, the issue detail, and the status. Book stock is correctable here because the upload may leave that column blank for the store to supply, which means a wrong baseline is now something a store can introduce — without this you would have to re-upload the entire cycle to fix one figure. Correcting it here recalculates that record's variance against the new baseline.

You cannot mark a record as **Submitted** while either its book stock or its physical count is still blank: a submitted record with a blank on either side has a variance that can never be computed, and every downstream discrepancy check would read it as a clean match.

All overrides are logged in the Activity Log with before and after values against your name, book stock included. The variance is always recalculated on the server; it is never a figure you type.

Use overrides sparingly. They are for correcting a single unambiguous data-entry error after the fact. If a store's numbers are wrong in substance, use **Unlock Store** so the store recounts and the corrected figures carry their name rather than yours.

### Bulk override

When many rows need the same treatment — typically marking a long tail of exact matches as reviewed — use the bulk action on **Admin -> Inventory** rather than opening rows one at a time. It applies the same change to every selected record in one go, up to **500 records per action**, and writes a single Activity Log entry covering the set.

## The Review Chain

A cycle normally moves through three hands, and it is worth knowing where a store currently sits before you intervene:

| Stage | Who acts | What it means |
|---|---|---|
| Pending | Store manager | Counting in progress; rows are editable by the store |
| Submitted | Store manager finished | Rows are locked to the store and queued for the Area Manager |
| Returned | Area Manager sent it back | All counts cleared; the store is recounting from scratch |
| Approved by AM | Area Manager signed off | Ready for your final check and for reporting |

Your **Unlock Store** works at any stage and overrules the Area Manager. Their **Return for Recount** only works while a store has submitted items and has not yet been approved. If an Area Manager needs to undo their own approval, only you can do it.
