# KinMarché — System Limitations & Capacity Guide

> **Who is this for?**
> This document is written for managers, administrators, and store team leads — no technical knowledge needed. It answers the most common questions about what the system can and cannot do, and what to expect as your team grows.

---

## Quick Summary

| Question | Answer |
|---|---|
| How big can my Excel file be? | Up to **10 MB** |
| How many rows can I upload? | Up to ~**50,000 items** in one file |
| How many users can log in? | **No fixed limit** — depends on your internet plan |
| How long does a login session last? | **8 hours**, then you must sign in again |
| How many stores can I manage? | **No fixed limit** |
| How many wrong passwords before lockout? | **10 attempts** per 15 minutes |

---

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

> **Tip:** If your file is too large, split it into two uploads — one per group of stores. The system accepts multiple uploads per cycle.

---

### What the preview shows

When you click **"Validate File"** before uploading, the system shows you a preview of the **first 100 rows** only. This is just for checking — the full file is processed completely when you confirm the upload.

---

### Duplicate date warning

If you try to upload a file for a date that already has a cycle within **3 days**, the system will warn you. You can still proceed if you confirm — for example, if you need to re-upload a corrected file.

---

### Upload processing time

| File Size | Expected Wait Time |
|---|---|
| Small (under 1 MB) | Under 5 seconds |
| Medium (1–5 MB) | 10–30 seconds |
| Large (5–10 MB) | 30–90 seconds |

The system will time out and cancel if upload takes more than **2 minutes**. If this happens, try splitting your file into smaller parts.

---

### Accepted file formats

The system only accepts:
- `.xlsx` (Excel 2007 and newer) — **recommended**
- `.xls` (older Excel format)
- `.csv` (comma-separated text)

PDF, Word documents, and images are **not accepted**.

---

## 2. Users & Logins

### Session length — 8 hours

Once you sign in, your session lasts **8 hours**. After that, you will be automatically signed out and need to log in again.

> **Example:** If you sign in at 8:00 AM, your session expires at 4:00 PM.

This is a security feature to protect the system if you leave your computer unattended.

---

### Wrong password lockout — 10 attempts

If the wrong password is entered **10 times** within 15 minutes from the same computer, that computer is temporarily blocked from trying again for **15 minutes**. This prevents unauthorised people from guessing passwords.

> After 15 minutes, the block lifts automatically — no action needed from the admin.

---

### Number of users

There is **no built-in limit** on how many users you can create. You can have as many store managers and administrators as needed.

---

### Admin accounts

There must always be **at least 1 active Administrator** in the system. The last admin account cannot be deleted — this prevents you from accidentally locking everyone out.

---

### Password requirements

All passwords must be:
- At least **8 characters** long
- There are no other requirements, but longer and more complex passwords are safer

---

## 3. Stores & Plants

### Number of stores

There is **no built-in limit** on how many stores (plants) you can add. The system is designed for multi-plant networks.

---

### One manager per store

Each store manager account is assigned to **one specific store**. A manager can only see and count inventory for their own assigned store. They cannot access other stores' data.

---

### Deadline extensions

An admin can grant a deadline extension to a specific store. Each store can have **one extension per inventory cycle**. If you need to change it again, the previous extension is simply replaced.

---

## 4. Inventory & Stock Counts

### No limit on records per cycle

There is no cap on how many inventory items a cycle can contain. A single cycle can have records for all your stores and all your items.

---

### What store managers can and cannot change

| Action | Can the manager do it? |
|---|---|
| Enter physical stock quantity | Yes |
| Enter system stock quantity | Yes |
| Select shrinkage category | Yes (required if there is a discrepancy) |
| Add issue details / remarks | Yes (required if there is a discrepancy) |
| Submit the cycle | Yes (once all items are filled in) |
| Edit after submission | No — locked after submitting |
| Delete a record | No |
| See other stores' data | No |

---

### Quantities must be zero or positive

Physical stock and system stock quantities must be **0 or higher**. Negative numbers are not accepted (you cannot have −5 boxes of sardines on a shelf).

---

### Variance (difference) calculation

The system always calculates: **Variance = Physical Count − System Stock**

This calculation happens automatically on the server — managers cannot manually change the variance figure. This protects the integrity of your L&P data.

---

## 5. Reports & Exports

### Admin Inventory view (on screen)

When viewing inventory records on screen, the system loads **50 records per page** by default. You can increase this up to **200 per page** using the page size control.

---

### Excel & PDF exports

Exports have **no row limit** — whatever records match your filters are included in the downloaded file. If you have 50,000 matching records, all 50,000 go into the Excel file.

> **Warning:** Very large exports (10,000+ rows) may take 30–60 seconds to generate and download.

---

### Reconciliation Report

The Reconciliation Report now includes a **Cycle filter**. It is strongly recommended to always select a specific cycle before loading the report. Loading without a cycle filter will return **all records across all time**, which on a large database can be very slow.

---

## 6. Analytics & Hotspot Detection

### Repeat Hotspot detection

The system automatically finds items that have been short (missing stock) across multiple cycles. It looks back across the **last 4 inventory cycles** and flags any item that was short in **2 or more** of those cycles.

> **Example:** If "Whisky Black Label" was short in cycles for March, April, and May, it will be flagged as a repeat hotspot.

Only the **top 5** repeat hotspot items are shown on the dashboard. The full data is available in the Inventory section.

---

### Trends chart

The Trends / Analytics page shows shortage rates over time. It displays up to **24 past cycles** (about 2 years of monthly counts). You need at least **2 completed cycles** for the trends chart to appear.

---

## 7. Activity Log (Audit Trail)

The Activity Log records every action taken in the system — logins, uploads, edits, approvals, and more.

| What you see on screen | Up to 500 entries |
|---|---|
| What you can export to Excel | Up to 5,000 entries |

If you need to review activity beyond these limits, contact your system administrator who can run a direct database query.

---

## 8. Email Notifications

Email notifications (new cycle alerts, deadline reminders, submission confirmations) are optional and require the system to be configured with an email server (SMTP).

**If emails are not arriving:**
1. Check that the manager's email address is entered in User Management
2. Ask your administrator to confirm SMTP is configured
3. Check spam/junk folders

There is **no limit** on how many email notifications the system can send.

---

## 9. Performance Expectations

### How many people can use the system at the same time?

The system allows up to **300 API requests per minute** in total across all users. In practical terms:

| Scenario | What to expect |
|---|---|
| 5–10 users active simultaneously | Instant responses, no issues |
| 20–50 users active simultaneously | Fast, slight delay possible |
| 50–100 users active simultaneously | May feel slower; depends on server plan |
| 100+ users simultaneously | Recommend upgrading your hosting plan |

---

### Pages refresh automatically?

No. Most pages use a short-term cache to avoid unnecessary server calls:

| Page / Data | How often it refreshes |
|---|---|
| Dashboard | Every 30 seconds |
| Inventory list | Every time you apply filters (no auto-refresh) |
| Users list | Every 60 seconds (or immediately after changes) |
| Stores list | Every 60 seconds (or immediately after changes) |
| Batches / Cycles | Every 30 seconds |
| Activity Log | Every 60 seconds |

If you need the very latest data, use your browser's refresh button or navigate away and back.

---

## 10. Common Questions

**Q: My Excel file has 75,000 rows. Can I upload it?**
> It depends on the file size. If it is under 10 MB, yes. If it is over 10 MB, split it by store groups and upload in two parts. Both uploads will be merged into the same cycle.

**Q: A manager submitted by mistake. Can they undo it?**
> No. Once submitted, a store manager cannot undo a submission. An Administrator can unlock the store's submission from the Cycles page, which resets it to pending so the manager can re-enter and resubmit.

**Q: Can two managers submit at the same time?**
> Yes — each manager only sees and submits their own store's data. There is no conflict between different stores submitting simultaneously.

**Q: How long is data kept?**
> Data is kept indefinitely unless an Administrator manually deletes a cycle. There is no automatic deletion or archiving.

**Q: Can I use the system on a phone or tablet?**
> Yes. The system is responsive and works on mobile devices. However, the inventory entry table works best on a laptop or desktop screen where you can see all columns without horizontal scrolling.

**Q: What happens if I lose internet during entry?**
> Each row is saved automatically as you type (within about 1 second). If you lose connection, any rows you were actively typing when the connection dropped may not be saved. The system shows a green tick next to each saved row — if you do not see a green tick, that row was not saved.

---

## 11. Summary Table — All Limits at a Glance

| Feature | Limit | Notes |
|---|---|---|
| File size | 10 MB | Per upload |
| File rows (approx.) | ~50,000 | Depends on columns and file size |
| File preview | 100 rows | Full file still processed |
| File formats | .xlsx, .xls, .csv | PDF/images not accepted |
| Upload timeout | 2 minutes | Split large files if needed |
| Duplicate date warning | ±3 days | Can override with confirmation |
| Login session | 8 hours | Then must re-login |
| Wrong password lockout | 10 tries / 15 min | Auto-lifts after 15 min |
| Min password length | 8 characters | — |
| Number of users | Unlimited | Database plan may apply |
| Number of stores | Unlimited | Database plan may apply |
| Admin accounts minimum | 1 | Cannot delete last admin |
| Records per screen page | 50 (max 200) | Adjustable with filter |
| Export rows | Unlimited | All matching records |
| Reconciliation report | All matching records | Always filter by cycle |
| Hotspot detection | Last 4 cycles | Flags ≥2 consecutive shortages |
| Hotspots shown | Top 5 | Full data in Inventory view |
| Trends history | Up to 24 cycles | Needs ≥2 cycles |
| Activity log on screen | 500 entries | — |
| Activity log export | 5,000 entries | Excel download |
| API requests | 300 per minute | All users combined |

---

*Last updated: July 2026 — KinMarché Loss & Prevention Platform*
