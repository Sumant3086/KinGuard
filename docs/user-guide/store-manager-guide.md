# Store Manager Guide

> Step-by-step guide for store managers completing a physical stock count in KinMarché.

---

## Table of Contents

- [Your Role](#your-role)
- [Signing In](#signing-in)
- [Your Dashboard](#your-dashboard)
- [Completing a Stock Count](#completing-a-stock-count)
  - [Opening the Stock Count Page](#opening-the-stock-count-page)
  - [Understanding the Columns](#understanding-the-columns)
  - [Entering Your Counts](#entering-your-counts)
  - [Recording Discrepancies](#recording-discrepancies)
  - [Auto-Save](#auto-save)
- [Submitting Your Count](#submitting-your-count)
- [After Submission](#after-submission)
- [Handling Past Cycles](#handling-past-cycles)
- [Notifications](#notifications)
- [Deadlines and Locks](#deadlines-and-locks)
- [Downloading Your Report](#downloading-your-report)
- [Frequently Asked Questions](#frequently-asked-questions)

---

## Your Role

As a store manager you are responsible for:

1. **Physically counting** the stock in your store
2. **Entering your counts** into KinMarché for each item assigned to your store
3. **Noting the reason** for any items where your count differs from the book stock
4. **Submitting** your completed count by the deadline

You can only see your own store's data — other stores are not visible to you.

---

## Signing In

Navigate to the KinMarché URL and click **Sign In**. Enter your Employee ID and password.

Your store's name will appear in the navigation bar at the top of the screen. The navigation bar is **white with a red bottom border** — this is how you can tell you are logged in as a store manager (administrators see a red navigation bar).

---

## Your Dashboard

After signing in you land on your **Stock Count Dashboard**.

### What you see

| Section | Description |
|---------|-------------|
| **Count Date** | The date this inventory cycle is for |
| **Submission Deadline** | When your count is due (if set by your administrator) |
| **Progress bar** | How many items you have counted out of the total |
| **Summary cards** | Quick counts: Total Items, Still to Count, Counted, Exact Match, Missing Items, Surplus Items |
| **Action card** | A direct link to open your Stock Count entry page |

### Understanding the summary cards

| Card | Meaning |
|------|---------|
| **Total Items** | Number of items assigned to your store for this cycle |
| **Still to Count** | Items where you have not entered a count yet |
| **Counted** | Items you have entered and saved |
| **Exact Match** | Items where your count equals the book stock |
| **Missing Items** | Items where your count is less than book stock (potential loss or theft) |
| **Surplus Items** | Items where your count is more than book stock |

---

## Completing a Stock Count

### Opening the Stock Count Page

Click **Start Counting →** on your dashboard, or **Stock Count** in the navigation bar.

### Understanding the Columns

| Column | What it means |
|--------|--------------|
| **Item Code** | The unique code for this item (from your store's ERP system) |
| **Item Name** | The description of the item |
| **Book Stock** | The quantity the system says you should have |
| **Your Count** | The quantity you physically counted — **this is what you enter** |
| **Variance** | Automatically calculated: Your Count − Book Stock |
| **Category** | Required when Variance ≠ 0 — the type of issue |
| **Issue Detail** | Required when Variance ≠ 0 — specific description of the problem |
| **Status** | Pending (not yet submitted) or Submitted |

**Variance explained:**
- **0** → Your count matches the book stock. No action needed.
- **Negative (−)** → Missing items. Your count is lower than expected. This is a shortage.
- **Positive (+)** → Extra items. Your count is higher than expected. This is a surplus.

### Entering Your Counts

1. Find the item you have just counted on the list
2. Click the **Your Count** field for that item
3. Type the quantity you physically counted
4. The **Variance** column updates instantly as you type
5. The row is saved automatically — you do not need to click a Save button

You can also use the **Book Stock** field to correct the system quantity if it is clearly wrong (for example, your records show a recent delivery that the system has not yet captured). Check with your administrator before doing this.

**Tips:**
- Use the **Search** box at the top to find a specific item quickly by name or code
- Use the **Status** filter to show only items you have not yet counted (select **Pending**)
- Use the **Count Period** dropdown to switch between different inventory cycles
- The **Jump to next** button scrolls to the first uncounted item

### Recording Discrepancies

When the variance is not zero, KinMarché requires you to explain why.

**Step 1 — Select a Category:**

| Category | Use when |
|----------|---------|
| **Dented** | Packaging is physically damaged |
| **Expiry** | Item has passed or is approaching its expiry date |
| **Damage** | Item itself is damaged or broken |
| **In Transit** | Damage or shortage occurred during delivery |
| **Other** | None of the above apply |

**Step 2 — Select an Issue Detail:**

After selecting a category, a second dropdown appears with specific reasons. Choose the one that best describes the situation. For **Other**, type a free-text description.

**Examples:**

| Situation | Category | Issue Detail |
|-----------|---------|-------------|
| Box was dropped and dented | Dented | Direct dent to product, product not ok |
| Items past use-by date | Expiry | Expired stock identified during stock take |
| Items received broken | In Transit | OS&D report for transit damage |
| Items cannot be found | Other | Inventory adjustment due to system error/discrepancy |
| Items stolen | Other | Stock shared to national employees *(or describe the situation)* |

---

## Auto-Save

Your entries are saved **automatically** — you do not need to click Save after every item.

Here is how it works:
- You type a count into the **Your Count** field
- After you stop typing for 0.7 seconds, it saves automatically
- A spinning indicator appears briefly in the last column while saving
- A green tick ✓ appears when the save is confirmed

You can also click the **Save** button in the last column to save immediately without waiting.

The **autosave notice** at the top of the page appears while changes are in progress. It disappears once everything is saved.

> **Do not close the browser tab** while the autosave indicator is spinning — wait for the green tick first.

---

## Submitting Your Count

Once you have entered counts for all items and the autosave is complete, you can submit.

### Before you submit, make sure:

- [ ] All items in the **Your Count** column have a number (no blanks)
- [ ] All items with a non-zero Variance have a **Category** selected
- [ ] All items with a non-zero Variance have **Issue Detail** filled in
- [ ] The autosave indicator is no longer showing

### How to submit:

1. Click **Submit Count ({N} items)** in the top-right corner
2. A confirmation dialog will appear — click **OK** to confirm
3. Your count is submitted and records become read-only

### What happens after submission:

- Your administrator receives an email notification
- Your administrator sees your store updated to "Submitted" on their dashboard
- You are shown a **post-submission summary** with matched, shortage, and surplus counts
- You can download your report from the post-submission page or the Stock Count page

---

## After Submission

After submitting you will see a summary screen showing:

- Total items submitted
- **Matched** — count exactly matched book stock
- **Shortage** — count was below book stock
- **Surplus** — count was above book stock

If there are any discrepancies, a detail table shows each affected item with the variance and your entered category and notes.

From this screen you can:
- **View Submitted Records** — return to the Stock Count page in read-only mode
- **Download My Report** — download your store's count as an Excel file

Your records are now **locked**. If a correction is needed, contact your administrator — they can unlock your store's submission so you can recount.

---

## Handling Past Cycles

Sometimes your administrator uploads inventory for a date in the past (for example, if there was a delay in getting the ERP export).

When this happens, your **Dashboard** will show a **blue notice** listing any earlier cycles that still need your count:

> *"You have 1 earlier count cycle still pending: 1 Jun 2026"*

Click the date link to go directly to that cycle's stock count entry page.

You can also select any past cycle from the **Count Period** dropdown on the Stock Count page to view or enter historical counts.

---

## Notifications

The **bell icon** in the navigation bar shows alerts relevant to you. Alerts update automatically every 60 seconds.

| Alert type | What it means |
|-----------|--------------|
| 🔵 Items ready | A new cycle has been uploaded with items for your store |
| 🟡 Deadline approaching | Your submission is due in less than 48 hours |
| 🔴 Past deadline | The deadline has passed — contact your administrator |

Clicking an alert takes you directly to the relevant count page.

---

## Deadlines and Locks

Your administrator may set a **submission deadline** for each inventory cycle. You can see the deadline on your dashboard and in the Stock Count page header.

### If you are approaching the deadline:

A yellow warning banner appears on your dashboard:
> *"Deadline approaching — please complete your count soon."*

### If the deadline has passed:

A red lock banner appears:
> *"Submission locked. The deadline has passed. Contact your administrator to request an extension."*

When locked, you cannot edit or submit records. Contact your administrator and ask them to grant you a deadline extension.

### If you have a personal extension:

Your administrator can grant your store a later deadline than the rest of the network. If this happens, your deadline will reflect the extended date — you will not see the lock until your personal deadline passes.

---

## Downloading Your Report

At any time (before or after submission), you can download your store's count as an Excel file.

**Before submission:**
- Click the **Download** button in the top-right corner of the Stock Count page

**After submission:**
- Click **Download My Report** on the post-submission summary screen
- Or navigate to **Stock Count** in the navigation bar and click **Download**

The downloaded file includes all items for your store in the selected cycle: item code, item name, book stock, your count, variance, category, issue detail, and status.

---

## Frequently Asked Questions

**Q: I submitted by mistake — can I undo it?**  
A: No. Once submitted, records are locked and you cannot undo the submission yourself. Contact your administrator and ask them to unlock your store for the cycle so you can recount.

**Q: I see a blank page or "No active stock count right now."**  
A: Your administrator has not yet uploaded an inventory cycle, or your store was not included in the current cycle. Contact your administrator.

**Q: The Book Stock looks wrong for an item.**  
A: The Book Stock comes from your organisation's ERP system at the time the file was uploaded. If it is clearly incorrect (e.g., missing a known delivery), you can edit the Book Stock field — but check with your administrator first. Any change is automatically logged.

**Q: I entered the wrong number and the page saved it. What do I do?**  
A: Simply retype the correct number. The Save button re-saves and overwrites the previous value. You can correct entries until the deadline passes or you submit.

**Q: My count session timed out. Did I lose my data?**  
A: No. Every save is immediately stored in the database. When you log back in, all saved counts will be there. Only unsaved changes (items you typed but the spinning indicator had not finished) may be lost.

**Q: I cannot see the Submit button.**  
A: The Submit button only appears when there are pending items to submit. If the cycle is locked (past deadline) or all items are already submitted, the button is hidden. Check the status column for each row.

**Q: The system says I have items in another cycle.**  
A: Check the blue notice on your Dashboard — your administrator may have uploaded inventory for an earlier date. Click the date link to go to that cycle.

**Q: Can other stores see my data?**  
A: No. You can only see your own store's data. Each store manager is strictly limited to their assigned store.
