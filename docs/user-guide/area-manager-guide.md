# Area Manager Guide

Step-by-step guide for Area Managers reviewing and approving store inventory submissions in KinMarché.

## Your Role

As an Area Manager you are responsible for the stores assigned to you. When store managers submit their physical counts, your job is to:

1. Review each submission to check the numbers look reasonable
2. Approve submissions that are correct
3. Return submissions to the store manager if something looks wrong, with a clear written reason
4. Escalate unusual patterns to your administrator

You cannot see stores that are not assigned to you. You cannot edit system stock quantities or create new cycles — only admins can do that.

## Signing In

Navigate to the KinMarché URL and click **Sign In**. Enter your Employee ID and password.

Your navigation bar has a **dark header** and shows two sections: Dashboard and Review Submissions.

## Your Dashboard

The dashboard gives you a summary of where your stores stand for the current cycle.

| Section | What it shows |
|---|---|
| Total Stores | How many stores are assigned to you |
| Awaiting Review | Stores that have submitted and are waiting for your review |
| Approved | Stores you have already approved this cycle |
| Returned | Stores you sent back for recount |
| Store Progress | A table showing each store's submission and review status |

### Store Progress Table

Each row shows one of your stores with:
- **Total items** — how many items are in the cycle for this store
- **Submitted** — how many items the store manager has counted
- **Pending** — how many items still need a count
- **Review Status** — whether you have reviewed this store yet (Awaiting Review / Approved / Returned)

Stores showing **Awaiting Review** are ready for you to check. Click **Review Submissions** in the navigation to start.

## Reviewing a Submission

### Step 1 — Select a Cycle

Go to **Review Submissions**. You will see a list of inventory cycles. The most recent cycle is at the top.

Each cycle row shows:
- The inventory date
- How many of your stores are pending review, approved, or returned

Click a cycle date to open the review screen for that cycle.

### Step 2 — Select a Store

The review screen shows all your stores for the selected cycle. Stores with status **Awaiting Review** are ready for you to check.

Click a store name to load its inventory records.

### Step 3 — Review the Records

You will see every item for this store with:

| Column | What it means |
|---|---|
| Item Code | The unique code for this item |
| Item Name | Description of the item |
| Book Stock | What the system says should be there |
| Physical Count | What the store manager counted |
| Variance | Difference between counted and book stock (negative = shortage, positive = surplus) |
| Category | The reason the manager gave for any discrepancy |
| Issue Detail | The specific description the manager entered |

Look for:
- Large shortages in high-value items
- Suspicious patterns (the same item missing in every submission)
- Missing or vague explanations for discrepancies

### Step 4 — Edit if Needed (Optional)

If you spot a clear data entry mistake (for example, a manager typed 1 instead of 10), you can correct it before approving:

1. Click the **Edit** button on a row
2. Change the Physical Count to the correct value
3. Click **Save**

All your edits are recorded in the activity log.

### Step 5 — Approve or Return

Once you have reviewed all records for a store, you have two options:

**Approve** — The submission looks correct. Click **Approve** at the bottom of the screen.
- You can add an optional remark for the administrator (e.g. "Checked with store — shortage is confirmed stock room damage").
- The administrator is notified and can see the approved status on their dashboard.

**Return for Recount** — Something looks wrong and the store needs to recount. Click **Return for Recount**.
- You **must** write a reason. This message is shown directly to the store manager. Be specific so they know what to correct.
- Example: "Please recount the whisky aisle — the counts for items 1000013986 and 1000017695 look significantly off. Check if any were moved to the stockroom."
- The store manager's submission is fully reset. They start the count again from scratch.
- The store manager sees your message in their notification bell.

## What Happens After You Approve

Once you approve a store:
- The administrator sees it as **Approved by AM** on their dashboard
- The administrator can then do their own final review
- The cycle count for that store is locked unless the administrator explicitly unlocks it

## What Happens After You Return a Store

When you return a submission:
- All counted records are reset to zero — the store manager must recount every item
- The store manager sees a notification: "Your submission was returned — [your reason]"
- They will resubmit, and it will come back into your review queue

## Notifications

The bell icon in the navigation bar shows pending actions:

| Notification | What it means |
|---|---|
| N stores awaiting review | These stores have submitted and are waiting for you to check them |
| Deadline in Xh | Some of your stores have not submitted yet and the deadline is approaching |

Click a notification to jump directly to the relevant screen.

## Frequently Asked Questions

**Can I see stores that are not assigned to me?**
No. You can only see stores explicitly assigned to you by your administrator.

**Can I approve a store that has not finished submitting?**
No. All items must be submitted (no pending count rows) before you can approve. If some items are still pending, the Approve button will be disabled and a warning will tell you how many items are missing.

**Can I change the submission deadline?**
No. Only administrators can set or change deadlines. Contact your administrator if a store needs more time.

**A store manager says they submitted but I can't see it.**
This can happen if the cycle is not yet complete (some items still pending). Ask the store manager to submit again — they may not have clicked the final Submit button.

**Can I return a submission after I have already approved it?**
No — once you approve, only the administrator can unlock the submission. Contact your administrator and explain the situation.

**What if I disagree with my administrator's override of a record?**
All changes are recorded in the activity log. Discuss it with your administrator directly.
