# Store Manager Guide

Step-by-step guide for completing a physical stock count in KinMarche.

## Your Role

As a store manager you are responsible for:

1. Physically counting the stock in your store
2. Entering your counts into KinMarche for each item assigned to your store
3. Noting the reason for any items where your count differs from the book stock
4. Submitting your completed count by the deadline

You can only see your own store's data. Other stores are not visible to you.

## Signing In

Navigate to the KinMarche URL and click **Sign In**. Enter your Employee ID and password.

Your store's name appears in the navigation bar at the top. The bar is **white with a red bottom border** — administrators see a fully red navigation bar, so this is how you can tell which role you are in.

## Your Dashboard

After signing in you land on your Inventory Count Dashboard.

| Section | Description |
|---|---|
| Inventory Date | The date this inventory cycle is for |
| Submission Deadline | When your count is due, if set by your administrator |
| Progress bar | How many items you have counted out of the total |
| Summary cards | Total Items, Pending, Submitted, Matched, Shortage, Excess |

Summary card meanings:

| Card | Meaning |
|---|---|
| Total Items | Number of items assigned to your store for this cycle |
| Pending Count | Items where you have not entered a count yet |
| Submitted | Items you have saved and submitted |
| Matched | Items where your count equals the system stock |
| Shortage Items | Items where your count is less than system stock |
| Excess Items | Items where your count is more than system stock |

## Completing a Stock Count

### Opening the Count Page

Click **Begin Count** on your dashboard, or **Inventory Count** in the navigation bar.

### Understanding the Columns

| Column | What it means |
|---|---|
| Item Code | The unique code for this item from your store's system |
| Item Name | The description of the item |
| Book Stock | The quantity the system says you should have |
| Your Count | The quantity you physically counted — this is what you enter |
| Variance | Calculated automatically: Your Count minus Book Stock |
| Category | Required when Variance is not zero |
| Issue Detail | Required when Variance is not zero |
| Status | Pending or Submitted |

Variance explained:
- **0** — Your count matches book stock. Nothing to add.
- **Negative** — Missing items. Your count is lower than expected. This is a shortage.
- **Positive** — Extra items. Your count is higher than expected. This is a surplus.

### Entering Your Counts

1. Find the item you counted on the list
2. Click the **Your Count** field for that item
3. Type the quantity you counted
4. The Variance column updates instantly as you type
5. The row saves automatically — no Save button needed

Tips:
- Use the **Search** box to find a specific item by name or code
- Use the **Status** filter to show only uncounted items (select Pending)
- Use **Jump to Next Blank** to scroll to the first uncounted item
- Use the **Inventory Cycle** dropdown to switch between cycles

### Recording Discrepancies

When the variance is not zero, you must explain why.

**Step 1 - Select a Category:**

| Category | Use when |
|---|---|
| Dented | Packaging is physically damaged |
| Expiry | Item has passed or is near its expiry date |
| Damage | Item itself is damaged or broken |
| In Transit | Damage or shortage occurred during delivery |
| Other | None of the above apply |

**Step 2 - Select an Issue Detail:**

After selecting a category, a second dropdown appears with specific reasons. For Other, type a free-text description.

Examples:

| Situation | Category | Issue Detail |
|---|---|---|
| Box was dropped and dented | Dented | Direct dent to product, product not ok |
| Items past use-by date | Expiry | Expired stock identified during stock take |
| Items received broken | In Transit | OS&D report for transit damage |
| Items cannot be found | Other | Inventory adjustment due to system error |

## Auto-Save

Your entries save automatically — no need to click Save after every item.

How it works:
- You type a count into the Your Count field
- After you stop typing for about 1 second, it saves automatically
- A spinning indicator appears briefly while saving
- A green tick appears when the save is confirmed

You can also click the **Save** button on a row to save immediately.

The autosave notice at the top of the page (*Changes pending - saving automatically*) disappears once everything is saved.

Do not close the browser tab while the autosave indicator is spinning. Wait for the green tick first.

## Submitting Your Count

Once you have entered counts for all items and auto-save is complete:

Before you submit, check:
- All items in the Your Count column have a number (no blanks)
- All items with a non-zero Variance have a Category selected
- All items with a non-zero Variance have Issue Detail filled in
- The autosave indicator is not showing

How to submit:
1. Click **Submit Count** in the top-right corner
2. A confirmation dialog appears — click **Submit** to confirm
3. Your count is submitted and records become read-only

After submission your administrator receives an email notification, your store updates to Submitted on their dashboard, and you see a summary screen.

## After Submission

The summary screen shows:
- Total items submitted
- Matched — count matched book stock exactly
- Shortage — count was below book stock
- Surplus — count was above book stock

A detail table shows each discrepant item with the variance and your notes.

From this screen you can view submitted records (read-only) or download your reconciliation report as Excel.

Your records are now locked. If a correction is needed, contact your administrator — they can unlock your submission so you can recount.

## Handling Past Cycles

If your administrator uploaded inventory for an earlier date, your Dashboard shows a blue notice listing any earlier cycles that still need your count. Click the date link to go to that cycle.

You can also select any past cycle from the Inventory Cycle dropdown on the Inventory Count page.

## Notifications

The bell icon in the navigation bar shows alerts, updated every 60 seconds.

| Alert | What it means |
|---|---|
| Blue - Items ready | A new cycle has been uploaded with items for your store |
| Yellow - Deadline approaching | Your submission is due in under 48 hours |
| Red - Past deadline | The deadline has passed — contact your administrator |

Clicking an alert takes you directly to the relevant count page.

## Deadlines and Locks

Your administrator may set a submission deadline for each cycle. You can see it on your dashboard and on the count page.

**Approaching the deadline:** A yellow warning banner appears on your dashboard.

**After the deadline passes:** A red lock banner appears — *Count Cycle Locked. Contact your administrator to request an extension.* You cannot edit or submit when locked.

**Personal extension:** Your administrator can grant your store a later deadline than the rest of the network. If this happens, your deadline reflects the extended date.

## Downloading Your Report

Before submission: Click **Download Report** in the top-right corner of the Inventory Count page.

After submission: Click **Download Reconciliation Report** on the summary screen, or go to Inventory Count and click **Download Report**.

The file includes all items for your store: item code, name, book stock, your count, variance, category, issue detail, and status.

## Frequently Asked Questions

**Q: I submitted by mistake — can I undo it?**
A: No. Contact your administrator and ask them to unlock your store for the cycle so you can recount.

**Q: I see "No Active Inventory Cycle" on my dashboard.**
A: Your administrator has not yet uploaded a cycle for your store, or your store was not included. Contact your administrator.

**Q: The Book Stock looks wrong for an item.**
A: The Book Stock comes from your organisation's ERP at the time the file was uploaded. If it is clearly wrong, you can edit it in the Book Stock field — but check with your administrator first. Any change is logged.

**Q: I entered the wrong number. What do I do?**
A: Simply retype the correct number. It overwrites the previous value automatically.

**Q: My session timed out. Did I lose my data?**
A: No. Every save is stored in the database immediately. When you log back in, all saved counts are there. Only items you were actively typing when the session ended may not have saved — check those rows first.

**Q: I cannot see the Submit button.**
A: The Submit button only appears when there are pending items. If the cycle is locked or all items are already submitted, the button is hidden.

**Q: Can other stores see my data?**
A: No. You can only see your own store's data.
