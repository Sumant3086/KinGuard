# KinMarché — System Limitations & Capacity Guide

## Quick Summary

| Question | Answer |
|---|---|
| How big can my Excel file be? | Up to **10 MB** |
| How many rows can I upload? | Up to ~**50,000 items** in one file |
| How many users can log in? | **No fixed limit** — depends on your internet plan |
| How long does a login session last? | Up to **7 days** of inactivity before you must sign in again |
| How many stores can I manage? | **No fixed limit** |
| How many wrong passwords before lockout? | **10 wrong attempts** locks the account for 15 minutes |
| Can anyone edit the book stock figure? | **No** — read-only for every role, including admins |
| What languages does it support? | **English and French**, switchable in the navigation bar |

## 1. File Uploads (Excel / CSV)

### Maximum file size — 10 MB

Your inventory Excel file must be **10 MB or smaller**.

**How big is 10 MB in practice?**

| Number of Items (Rows) | Approx. File Size | Will it upload? |
|---|---|---|
| 1,000 items | ~0.1 MB | Yes |
| 10,000 items | ~1 MB | Yes |
| 30,000 items | ~3 MB | Yes |
| 50,000 items | ~5–8 MB | Usually yes |
| 80,000+ items | 10+ MB | May be too large |

### What the preview shows

When you click **"Validate File"** before uploading, the system shows you a preview of the **first 100 rows** only. This is just for checking — the full file is processed completely when you confirm the upload.

### Duplicate date warning

If you try to upload a file for a date that already has a cycle within **3 days**, the system will warn you. You can still proceed if you confirm — for example, if you need to re-upload a corrected file.

### Upload processing time

| File Size | Expected Wait Time |
|---|---|
| Small (under 1 MB) | Under 5 seconds |
| Medium (1–5 MB) | 10–30 seconds |
| Large (5–10 MB) | 30–90 seconds |

The system will time out and cancel if upload takes more than **2 minutes**. If this happens, try splitting your file into smaller parts.

### Accepted file formats

The system only accepts:
- `.xlsx` (Excel 2007 and newer) — **recommended**
- `.xls` (older Excel format)
- `.csv` (comma-separated text)

PDF, Word documents, and images are **not accepted**.

## 2. Users & Logins

### Session length — up to 7 days

Once you sign in, the system keeps you signed in automatically in the background for up to **7 days** of activity, refreshing your session every few minutes without interrupting you. If you don't open the app for 7 days, or you sign out manually, you'll need to log in again.

### Wrong password lockout

If a login is attempted with the wrong password **10 times in a row** for the same account, that account is temporarily locked for **15 minutes** as a protection against password-guessing. Signing in with the correct password before then still fails until the lockout expires — contact your administrator if you need it cleared sooner.

### Number of users

There is **no built-in limit** on how many users you can create. You can have as many store managers and administrators as needed.

### Admin accounts

There must always be **at least 1 active Administrator** in the system. The last admin account cannot be deleted — this prevents you from accidentally locking everyone out.

### Password requirements

All passwords must:
- Be between **8 and 128 characters** long
- Include at least **one uppercase letter** (A–Z)
- Include at least **one lowercase letter** (a–z)
- Include at least **one number** (0–9)

## 3. Stores & Plants

### Number of stores

There is **no built-in limit** on how many stores (plants) you can add. The system is designed for multi-plant networks.

### One store per manager account

Each store manager account is assigned to **one specific store**. A manager can only see and count inventory for their own assigned store. They cannot access other stores' data. A store may have more than one manager account if you need cover for shifts or leave.

### Auto-created stores per upload

If an uploaded file contains plant codes that do not exist yet, up to **50 new stores** are created automatically in one upload. A file with more unknown codes than that is rejected — at that scale it is almost always a wrong file or a wrong column, not fifty new branches.

### Area Manager assignments

An Area Manager can hold any number of stores, and a store has at most one Area Manager. Saving an Area Manager's store list **replaces** it entirely — stores left out of the list are unassigned, not left alone.

### Deadline extensions

An admin can grant a deadline extension to a specific store. Each store can have **one extension per inventory cycle**. If you need to change it again, the previous extension is simply replaced.

## 4. Inventory & Stock Counts

### No limit on records per cycle

There is no cap on how many inventory items a cycle can contain. A single cycle can have records for all your stores and all your items.

### What store managers can and cannot change

| Action | Can the manager do it? |
|---|---|
| Enter physical stock quantity | Yes |
| Enter system stock quantity (book stock) | **No** — read-only, see below |
| Select shrinkage category | Yes (required if there is a discrepancy) |
| Add issue details / remarks | Yes (required if there is a discrepancy) |
| Change the variance figure | No — always calculated on the server |
| Submit the cycle | Yes (once all items are filled in) |
| Edit after submission | No — locked after submitting |
| Delete a record | No |
| See other stores' data | No |

### System stock is read-only for everyone

The system stock (book stock) figure comes from the ERP file the administrator uploaded, and **no role can edit it** — not the store manager, not the Area Manager, not the administrator, and not through the admin Override screen. The only way to change it is to upload a corrected cycle.

This is the single most important rule in the system. Shrinkage is the gap between the book figure and the counted figure; if the people being measured — or the people reviewing them — could move the book figure, the gap would prove nothing. Everything else in this document is a capacity limit. This one is a design guarantee.

### Quantities must be zero or positive

Physical counts must be **0 or higher**. Negative numbers are not accepted (you cannot have −5 boxes of sardines on a shelf). The same applies to system quantities in an uploaded file: a negative or non-numeric value causes that row to be rejected in the preview.

### Variance (difference) calculation

The system always calculates: **Variance = Physical Count − System Stock**

The calculation happens on the server every time a count is saved, by a store manager, an Area Manager, or an administrator. Nobody types a variance directly, and nobody can save one that does not follow from the two quantities.

## 5. Reports & Exports

### Admin Inventory view (on screen)

When viewing inventory records on screen, the system loads **50 records per page** by default. You can increase this up to **200 per page** using the page size control.

### Excel & PDF exports

Exports are capped at **10,000 records**. If your filters match more than that, the download is blocked with a message asking you to narrow the results — select a specific cycle or store first, then export.

### Reconciliation Report

The Reconciliation Report includes a **Cycle filter**. Always select a specific cycle before loading the report — this keeps you comfortably under the 10,000-record export cap and avoids loading a large, slow, unfiltered result.

## 6. Analytics & Hotspot Detection

### Repeat Hotspot detection

The system automatically finds items that have been short (missing stock) across multiple cycles. It looks back across the **last 4 inventory cycles** and flags any item that was short in **2 or more** of those cycles.

Only the **top 5** repeat hotspot items are shown on the dashboard. The full data is available in the Inventory section.

### Trends chart

The Trends / Analytics page shows shortage rates over time. The chart plots the **last 8 completed cycles**; the underlying data can be requested for up to 24 cycles (about two years of monthly counts). You need at least **2 completed cycles** for the trends chart to appear.

### Risk scores and year-over-year comparison

Risk scoring and the year-over-year comparison both look at up to **12 cycles** at a time, defaulting to 6. Deleted cycles are excluded from every analytics figure.

## 7. Activity Log (Audit Trail)

The Activity Log records every action taken in the system — logins, uploads, edits, approvals, and more.

| What you see on screen | Up to 500 entries |
|---|---|
| What you can export to Excel | Up to 5,000 entries |

If you need to review activity beyond these limits, contact your system administrator who can run a direct database query.

## 8. Email Notifications

Email notifications (new cycle alerts, deadline reminders, submission confirmations) are optional and require the system to be configured with a Brevo API key (a free-tier email delivery service — no mail server setup needed).

**If emails are not arriving:**
1. Check that the manager's email address is entered in User Management
2. Ask your administrator to confirm the Brevo API key is configured
3. Check spam/junk folders

There is **no limit** on how many email notifications the system can send.

## 9. Performance Expectations

### How many people can use the system at the same time?

| Scenario | What to expect |
|---|---|
| 5–10 users active simultaneously | Instant responses, no issues |
| 20–50 users active simultaneously | Fast, slight delay possible |
| 50–100 users active simultaneously | May feel slower; depends on server plan |
| 100+ users simultaneously | Recommend upgrading your hosting plan |

### Pages refresh automatically?

No. Most pages use a short-term cache to avoid unnecessary server calls. The figures below are the **longest** a page can be behind; in practice it is usually less, and any change you make yourself is reflected immediately because your own action clears the cache for everyone.

| Page / Data | How stale it can be |
|---|---|
| Admin dashboard | Up to 5 minutes |
| Inventory list | Never cached — reloads every time you apply filters |
| Users list | Up to 2 minutes (immediately after changes) |
| Stores list | Up to 3 minutes (immediately after changes) |
| Batches / Cycles | Up to 1 minute (immediately after changes) |
| Activity Log | Up to 2 minutes |
| Analytics / Trends | Up to 5 minutes |
| Store and Area Manager dashboards | Up to 2 minutes |
| Notification bell | Refreshes itself every 60 seconds |

Actions that cross roles clear the caches on both sides. Uploading, closing, or deleting a cycle refreshes the affected store managers' and Area Managers' dashboards too, so nobody is left looking at a cycle that no longer exists.

If you need the very latest data, use your browser's refresh button or navigate away and back.

### Language

The interface is available in **English and French**. Switch with the language selector in the navigation bar; the choice is remembered in that browser. Data you type — store names, issue details, remarks — is stored exactly as entered and is not translated.

## 10. Common Questions

**Q: My Excel file has 75,000 rows. Can I upload it?**
No — the upload limit is 50,000 rows. Split it into two files (for example, by store range or item category) and upload them as separate cycles, or ask your administrator about combining them differently.

**Q: A manager submitted by mistake. Can they undo it?**
Not directly — once submitted, a store manager's records are locked and cannot be edited. Either the Area Manager can **Return for Recount** (if it hasn't been approved yet) or an Administrator can **Unlock Store** to reset that store's records back to pending. Both actions clear the counted values so the manager can recount from scratch.

**Q: Can two managers submit at the same time?**
Yes. Each store manager only ever affects their own assigned store's records — there's no shared state between stores, so simultaneous submissions from different stores never conflict.

**Q: How long is data kept?**
Indefinitely. Even when an administrator "deletes" a cycle, the records aren't actually erased — they're marked deleted and hidden from normal views, but preserved in the database and can be restored if needed. The Activity Log is never deleted at all.

**Q: Can I use the system on a phone or tablet?**
Yes. The interface is responsive and works in any modern mobile browser, and it can be installed as an app (Add to Home Screen) for quicker access.

**Q: What happens if I lose internet during entry?**
Your in-progress count for the row you're editing may fail to save until the connection returns — the app doesn't silently queue changes offline. If you notice a gap in your connection, re-check the last few rows you entered once you're back online before submitting.

## 11. Summary Table — All Limits at a Glance

| Feature | Limit | Notes |
|---|---|---|
| File size | 10 MB | Per upload |
| File rows (approx.) | ~50,000 | Depends on columns and file size |
| File preview | 100 rows | Full file still processed |
| File formats | .xlsx, .xls, .csv | PDF/images not accepted |
| Upload timeout | 2 minutes | Split large files if needed |
| Duplicate date warning | ±3 days | Can override with confirmation |
| Login session | Up to 7 days | Refreshes automatically while active; re-login after 7 days idle |
| Wrong-password lockout | 10 attempts | Locks the account for 15 minutes |
| Min password length | 8 characters | Must also include 1 uppercase, 1 lowercase, 1 number |
| Max password length | 128 characters | — |
| Number of users | Unlimited | Database plan may apply |
| Number of stores | Unlimited | Database plan may apply |
| Admin accounts minimum | 1 | Cannot delete last admin |
| Records per screen page | 50 (max 200) | Adjustable with filter |
| Export rows | 10,000 | Narrow filters if exceeded |
| Reconciliation report | Up to 10,000 records | Always filter by cycle |
| Bulk override | 500 records | Per action |
| Auto-created stores | 50 per upload | File rejected above this |
| Hotspot detection | Last 4 cycles | Flags items short in ≥2 of those cycles (not necessarily back-to-back) |
| Hotspots shown | Top 5 | Full data in Inventory view |
| Trends chart | Last 8 cycles | Data available for up to 24; needs ≥2 |
| Risk scores / year-over-year | Up to 12 cycles | Defaults to 6 |
| Activity log on screen | 500 entries | 100 by default |
| Activity log export | 5,000 entries | Excel download; 2,000 by default |
| Book stock editing | Not possible | Any role — re-upload the cycle instead |
| Languages | English, French | Switchable per browser |

*Last updated: July 2026 — KinMarché Loss & Prevention Platform*

