# Store Manager Guide

Step-by-step guide for completing a physical stock count in KinMarché.

## Your Role

As a store manager you are responsible for:

1. Physically counting the stock in your store
2. Entering your counts into KinMarché for each item assigned to your store
3. Noting the reason for any items where your count differs from the book stock
4. Submitting your completed count by the deadline

You can only see your own store's data. Other stores are not visible to you.

**What you can and cannot change:** you enter the *physical count* — the number you actually counted on the shelf. The *book stock* usually comes from the company ERP file your administrator uploaded, but that column is often left blank on purpose for you to fill in from your own records.

Both figures are yours to edit **until you submit**, and both lock the moment you do. That is the point of the system: once your count is final, the figure you are measured against is fixed and neither you nor your Area Manager can move it. After submission, only an administrator can correct book stock, and the correction is recorded against their name.

## Signing In

Navigate to the KinMarché URL and click **Sign In**. Enter your Employee ID and password.

Your store's name appears in the navigation bar at the top. All roles share the same crimson navigation bar; the thin accent line along its bottom edge tells you which role you are in — **teal** for store managers, blue for Area Managers, green for administrators.

### Changing the language

KinMarché is available in English and French. Use the language selector in the navigation bar to switch at any time. Your choice is remembered in that browser.

### If you are asked to change your password

New accounts, and accounts an administrator has reset, are sent straight to a **Set a new password** screen at sign-in. You cannot reach the rest of the app until it is done. The new password must be at least 8 characters and contain an uppercase letter, a lowercase letter, and a number, and it must be different from your current one.

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
| Book Stock | The quantity the system says you should have. Usually filled in by the upload; if it arrives blank, you enter it |
| Your Count | The quantity you physically counted — this is what you enter |
| Variance | Calculated automatically: Your Count minus Book Stock |
| Category | Required when Variance is not zero |
| Issue Detail | Required when Variance is not zero |
| Status | Pending or Submitted |

Variance explained:
- **0** — Your count matches book stock. Nothing to add.
- **Negative** — Missing items. Your count is lower than expected. This is a shortage.
- **Positive** — Extra items. Your count is higher than expected. This is a surplus.
- **—** (a dash) — One of the two quantities is still blank, so there is nothing to compare yet.

### Blank Book Stock

Some cycles arrive with the Book Stock column empty, shown as a dash with a highlighted box around the field. That is deliberate: the administrator's file left the figure for you to supply from your own records. Type it in the same way you type your count.

A dash is not the same as a 0. If the book genuinely says none, enter `0` — leaving it blank will stop you submitting.

Both figures lock the moment you submit, so check the book stock you entered before you do.

### Entering Your Counts

1. Find the item you counted on the list
2. Click the **Your Count** field for that item
3. Type the quantity you counted
4. If the **Book Stock** field is blank, fill that in too
5. The Variance column updates instantly as you type
6. The row saves automatically — no Save button needed

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
| Dented | Packaging is physically damaged but product inside is OK |
| Expiry | Item has passed or is near its expiry date |
| Damage | Item itself is damaged, broken, or unsaleable |
| In Transit | Shortage or damage happened during delivery from supplier or between locations |
| Theft | Items are missing and theft is suspected (internal or external) |
| Miscount | You believe there was a counting error — your count may not be the same as book stock but you think the physical stock is actually correct |
| Transfer | Stock was moved to another store or returned to the warehouse |
| Supplier | Supplier delivered less than the invoice stated, or wrong quantities were received |
| Other | None of the above apply |

**Step 2 - Select an Issue Detail:**

After selecting a category, a second dropdown appears with specific reasons that match that category. For the **Other** category, you type a free-text description.

Examples:

| Situation | Category | Issue Detail |
|---|---|---|
| Box was dropped and dented | Dented | Direct dent to product, product not ok |
| Items past use-by date | Expiry | Expired stock identified during stock take |
| Items received broken | In Transit | OS&D report for transit damage |
| Items obviously missing, no explanation | Theft | No evidence — stock unaccounted for |
| You counted 10 but you think you miscounted | Miscount | Counting error by store team |
| Stock sent to another branch | Transfer | Stock transferred to another store |
| Supplier invoice says 24 but only 20 arrived | Supplier | Short delivery from supplier |
| Items cannot be found, other categories don't fit | Other | Inventory adjustment due to system error/discrepancy |

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
- All items in the Book Stock column have a number (no blanks)
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

Your records are now locked. If a correction is needed there are two routes back: your Area Manager can **return** the submission for a recount, or your administrator can **unlock** your store for the cycle. Either way you start the count again.

## If Your Submission Is Returned

Your Area Manager reviews every submission before it is finalised. If something looks wrong they send it back with a written reason.

When that happens:

- A red banner appears on the Inventory Count page: *Your submission was returned by your Area Manager. Please recount and resubmit.*
- Their reason appears in your notification bell — read it first, it tells you exactly what to re-check
- Every count you entered for that cycle is cleared, along with the categories and issue details. This is deliberate: a recount has to start clean, not from the numbers that were questioned
- The rows go back to Pending and become editable again
- Recount, re-enter everything, and submit as normal. It returns to your Area Manager's review queue

Your Area Manager may also correct an obvious typing error on a single row themselves rather than returning the whole submission. Those edits are recorded in the activity log.

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
A: Book Stock comes from your organisation's ERP as it stood when the file was uploaded, unless the column arrived blank and you filled it in yourself. Either way you can still correct it while the cycle is open — retype it like any other field. Enter the quantity you actually counted, pick a category that explains the gap, and describe the problem in Issue Detail. Once you have submitted, it is locked; tell your administrator, who can correct it on their Override screen.

**Q: Book Stock shows a dash instead of a number.**
A: The uploaded file left that figure blank for you to supply. Enter it from your own records. A dash is not 0 — if the book genuinely says none, type `0`, because leaving it blank will stop you submitting.

**Q: I entered the wrong number. What do I do?**
A: Simply retype the correct number. It overwrites the previous value automatically.

**Q: My session timed out. Did I lose my data?**
A: No. Every save is stored in the database immediately. When you log back in, all saved counts are there. Only items you were actively typing when the session ended may not have saved — check those rows first.

**Q: I cannot see the Submit button.**
A: The Submit button only appears when there are pending items. If the cycle is locked or all items are already submitted, the button is hidden.

**Q: Can other stores see my data?**
A: No. You can only see your own store's data. Your Area Manager and your administrators can.

**Q: I typed my password wrong too many times and now it says my account is locked.**
A: Ten wrong attempts in a row lock the account for 15 minutes. Wait it out, or ask your administrator to reset your password. The correct password will not work until the lock expires.

**Q: My internet dropped while I was counting.**
A: The app does not save counts offline. The row you were editing may not have reached the server. When you are back online, re-check the last few rows you entered before you submit.

**Q: Can I count on my phone?**
A: Yes. The count page has a card layout built for phones, and you can add KinMarché to your home screen to open it like an app.
