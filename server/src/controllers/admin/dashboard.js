// Admin dashboard, trends, and the notification feed.

import { logger } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { sGet, sSet } from '../../services/serverCache.js';
import { parseIntParam } from '../../utils/params.js';
import { withDbRetry } from './shared.js';

export async function getDashboard(req, res, next) {
  const startTime = Date.now();
  try {
    const bust = !!req.query._bust; // manual refresh: skip server cache
    const cached = bust ? null : sGet('admin:dashboard');
    if (cached) return res.json(cached);

    // Round 1 — three cheap queries; wrap in withDbRetry so a dropped Supabase
    // idle-connection is recovered without surfacing a 503 to the user.
    // last4Batches belongs here rather than in round 2: it depends on nothing, and
    // moving it up lets the hotspot query (which needs its ids) run in round 2
    // instead of forcing a third sequential round-trip.
    const [totalStores, latestBatch, last4Batches] = await withDbRetry(() => Promise.all([
      prisma.store.count({ where: { isActive: true } }),
      prisma.uploadBatch.findFirst({
        where: { status: 'COMPLETED', isDeleted: false },
        orderBy: { inventoryDate: 'desc' },
        select: { id: true, inventoryDate: true, submissionDeadline: true },
      }),
      // COMPLETED only, matching latestBatch above — a half-finished upload has no
      // usable rows and would push a real cycle out of the 4-cycle hotspot window.
      prisma.uploadBatch.findMany({ where: { status: 'COMPLETED', isDeleted: false }, orderBy: { inventoryDate: 'desc' }, take: 4, select: { id: true } }),
    ]));

    if (!latestBatch) {
      const emptyResult = {
        totalStores,
        currentBatch: null,
        storeScorecard: [],
        hotspots: [],
        amReviewPipeline: [],
        networkSummary: { totalRecords: 0, matchedItems: 0, shortageItems: 0, excessItems: 0 },
      };
      sSet('admin:dashboard', emptyResult, 300_000);
      return res.json(emptyResult);
    }

    const now = new Date();
    const isDeadlinePassed = latestBatch.submissionDeadline
      ? now > new Date(latestBatch.submissionDeadline)
      : false;

    const batchIds = last4Batches.map((b) => b.id);

    // Round 2 — every remaining query in one burst. They all depend only on
    // latestBatch.id / batchIds, both resolved in round 1, so nothing here has to
    // wait on anything else here.
    const [
      perStoreStats, networkStats, allStores,
      topRemarkRows, amReviewPipelineRaw, hotspotRows,
    ] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          ir."storeId",
          COUNT(*)::int                                          AS "totalItems",
          COUNT(CASE WHEN ir.status = 'SUBMITTED' THEN 1 END)::int AS "submittedCount",
          COUNT(CASE WHEN ir.status = 'PENDING'   THEN 1 END)::int AS "pendingCount",
          COUNT(CASE WHEN ir.difference < 0 AND ir.status = 'SUBMITTED' THEN 1 END)::int AS "shortageCount",
          COUNT(CASE WHEN ir.difference = 0 AND ir.status = 'SUBMITTED' THEN 1 END)::int AS "matchedCount",
          COUNT(CASE WHEN ir.difference > 0 AND ir.status = 'SUBMITTED' THEN 1 END)::int AS "excessCount"
        FROM "InventoryRecord" ir
        WHERE ir."batchId" = ${latestBatch.id}
        GROUP BY ir."storeId"
      `,
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int                                                  AS "totalRecords",
          COUNT(CASE WHEN difference = 0  AND status = 'SUBMITTED' THEN 1 END)::int AS "matchedItems",
          COUNT(CASE WHEN difference < 0  AND status = 'SUBMITTED' THEN 1 END)::int AS "shortageItems",
          COUNT(CASE WHEN difference > 0  AND status = 'SUBMITTED' THEN 1 END)::int AS "excessItems"
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id}
      `,
      prisma.store.findMany({ where: { isActive: true }, select: { id: true, storeCode: true, storeName: true, areaManagerId: true, areaManager: { select: { name: true } } } }),
      prisma.$queryRaw`
        SELECT "storeId"::int AS "storeId", remarks, COUNT(*)::int AS cnt
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id} AND status = 'SUBMITTED' AND remarks IS NOT NULL AND remarks <> ''
        GROUP BY "storeId", remarks
        ORDER BY "storeId", cnt DESC
      `,
      // AM pipeline — ::int cast prevents BigInt JSON serialisation errors
      prisma.$queryRaw`
        SELECT r.status, r."storeId"::int AS "storeId", s."storeCode", s."storeName"
        FROM "AreaManagerReview" r
        JOIN "Store" s ON s.id = r."storeId"
        WHERE r."batchId" = ${latestBatch.id}
        ORDER BY r.status, s."storeName"
      `.catch(() => []), // table may not exist yet — silently return []
      batchIds.length >= 2
        ? prisma.$queryRaw`
            SELECT
              ir."storeId"::int AS "storeId",
              s."storeCode",
              s."storeName",
              ir."materialCode",
              ir."materialName",
              COUNT(DISTINCT ir."batchId")::int                             AS "batchCount",
              ROUND(SUM(ABS(ir.difference))::numeric, 1)::float             AS "totalShortage"
            FROM "InventoryRecord" ir
            JOIN "Store" s ON s.id = ir."storeId"
            WHERE ir."batchId" = ANY(${batchIds})
              AND ir.status = 'SUBMITTED'
              AND ir.difference < 0
            GROUP BY ir."storeId", s."storeCode", s."storeName", ir."materialCode", ir."materialName"
            HAVING COUNT(DISTINCT ir."batchId") >= 2
            ORDER BY "batchCount" DESC, "totalShortage" DESC
            LIMIT 5
          `
        : Promise.resolve([]),
    ]);

    const topRemarkMap = new Map();
    topRemarkRows.forEach((r) => {
      const sid = Number(r.storeId);
      if (!topRemarkMap.has(sid)) topRemarkMap.set(sid, r.remarks);
    });

    // Normalise storeId keys from raw SQL to Number to match Prisma ORM ids
    const statsMap = new Map(perStoreStats.map((r) => [Number(r.storeId), r]));

    const storeScorecard = allStores.map((store) => {
      const s = statsMap.get(store.id);
      const totalItems      = s ? s.totalItems     : 0;
      const submittedCount  = s ? s.submittedCount : 0;
      const shortageCount   = s ? s.shortageCount  : 0;
      // Rate is shortages as a share of what the store actually COUNTED, not of everything
      // it was assigned. Dividing by totalItems dilutes the rate by however much is still
      // pending, so a store that counted 10 items and found 10 shortages would score 10%
      // (GREEN) instead of 100% (RED) — understating risk on exactly the stores that matter.
      const shortageRate    = submittedCount > 0 ? Math.round((shortageCount / submittedCount) * 100) : 0;
      const isSubmitted     = s ? s.pendingCount === 0 && s.submittedCount > 0 : false;
      const isPending     = s ? s.pendingCount > 0 : false;
      const riskLevel     = shortageRate >= 20 ? 'RED' : shortageRate >= 5 ? 'YELLOW' : 'GREEN';
      return {
        storeId:         store.id,
        storeCode:       store.storeCode,
        storeName:       store.storeName,
        areaManagerName: store.areaManager?.name ?? null,
        totalItems,
        shortageCount,
        shortageRate,
        matchedCount: s ? s.matchedCount : 0,
        excessCount:  s ? s.excessCount  : 0,
        topRemark:    topRemarkMap.get(store.id) || null,
        status:    isSubmitted ? 'SUBMITTED' : isPending ? 'PENDING' : 'NO_DATA',
        isOverdue: isDeadlinePassed && isPending,
        riskLevel,
      };
    }).sort((a, b) => b.shortageRate - a.shortageRate);

    // Map SQL hotspot results (already sorted + limited to 5 by the query)
    const hotspots = hotspotRows.map((r) => ({
      storeCode:      r.storeCode,
      storeName:      r.storeName,
      materialCode:   r.materialCode,
      materialName:   r.materialName,
      batchCount:     Number(r.batchCount),
      totalShortage:  Number(r.totalShortage),
      dominantRemark: null, // omitted from SQL for performance; available on drilldown
    }));

    const net = networkStats[0] || {};
    const storesPending   = storeScorecard.filter((s) => s.status === 'PENDING').length;
    const storesSubmitted = storeScorecard.filter((s) => s.status === 'SUBMITTED').length;
    const overdueStores   = storeScorecard.filter((s) => s.isOverdue).map((s) => s.storeName);
    const amReviewPipeline = amReviewPipelineRaw;

    const duration = Date.now() - startTime;
    logger.debug('Admin dashboard built', { durationMs: duration });

    const result = {
      totalStores,
      currentBatch: {
        id: latestBatch.id,
        inventoryDate: latestBatch.inventoryDate,
        submissionDeadline: latestBatch.submissionDeadline,
        storesPending,
        storesSubmitted,
        overdueStores,
        isDeadlinePassed,
      },
      storeScorecard,
      hotspots,
      amReviewPipeline,
      networkSummary: {
        totalRecords: Number(net.totalRecords || 0),
        matchedItems: Number(net.matchedItems || 0),
        shortageItems: Number(net.shortageItems || 0),
        excessItems: Number(net.excessItems || 0),
      },
    };
    sSet('admin:dashboard', result, 300_000); // 5-minute cache
    
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTrends(req, res, next) {
  try {
    const cycles = parseIntParam(req.query.cycles, 'cycles', 6, 1, 24);
    const cacheKey = `admin:trends:${cycles}`;
    const cached = sGet(cacheKey);
    if (cached) return res.json(cached);
    const batches = (await prisma.uploadBatch.findMany({
      where: { isDeleted: false, status: 'COMPLETED' },
      orderBy: { inventoryDate: 'desc' },
      take: cycles,
      select: { id: true, inventoryDate: true },
    })).reverse(); // most-recent N, oldest-first for chart left-to-right ordering
    if (batches.length === 0) return res.json({ batches: [], series: [] });

    const batchIds = batches.map(b => b.id);
    const rows = await prisma.$queryRaw`
      SELECT
        ir."batchId",
        ir."storeId",
        s."storeName",
        COUNT(*)::int AS "totalItems",
        COUNT(CASE WHEN ir.status='SUBMITTED' THEN 1 END)::int AS "submittedCount",
        COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::int AS "shortageCount",
        SUM(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN ABS(ir.difference) ELSE 0 END)::float AS "totalUnitsLost"
      FROM "InventoryRecord" ir
      JOIN "Store" s ON s.id = ir."storeId"
      WHERE ir."batchId" = ANY(${batchIds})
      GROUP BY ir."batchId", ir."storeId", s."storeName"
    `;

    const storeMap = new Map();
    rows.forEach(r => {
      const sid = Number(r.storeId);
      if (!storeMap.has(sid)) storeMap.set(sid, { storeId: sid, storeName: r.storeName, data: [] });
      storeMap.get(sid).data.push({
        batchId: Number(r.batchId),
        totalItems: r.totalItems,
        shortageCount: r.shortageCount,
        // Share of counted items — same denominator as the dashboard and risk scores
        shortageRate: r.submittedCount > 0 ? Math.round((r.shortageCount / r.submittedCount) * 1000) / 10 : 0,
        totalUnitsLost: Math.round(r.totalUnitsLost * 10) / 10,
      });
    });

    const trendsResult = { batches: batches.map(b => ({ id: b.id, inventoryDate: b.inventoryDate })), series: Array.from(storeMap.values()) };
    sSet(cacheKey, trendsResult, 300_000); // 5-minute cache
    res.json(trendsResult);
  } catch (error) { next(error); }
}

// ── Admin notification feed — parallel queries for minimum latency ─────────────
export async function getNotifications(req, res, next) {
  try {
    const cached = sGet('admin:notifications');
    if (cached) return res.json(cached);

    const now = new Date();

    const latestBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED', isDeleted: false },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (!latestBatch) {
      sSet('admin:notifications', { items: [], count: 0 }, 30_000);
      return res.json({ items: [], count: 0 });
    }

    const pendingStores = await prisma.inventoryRecord.findMany({
      where: { batchId: latestBatch.id, status: 'PENDING' },
      select: { storeId: true },
      distinct: ['storeId'],
    });

    const items = [];
    const dateLabel = new Date(latestBatch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    // AM review status — how many stores are AM-approved and ready for admin's final review
    let amApproved = 0;
    try {
      const amReviews = await prisma.$queryRaw`
        SELECT status FROM "AreaManagerReview" WHERE "batchId" = ${latestBatch.id}
      `;
      amApproved = amReviews.filter(r => r.status === 'APPROVED').length;
    } catch { /* AreaManagerReview table not yet available — skip AM stats */ }

    // Only notify admin about stores they can act on: AM-approved = ready for admin's final review
    if (amApproved > 0) {
      items.push({
        type: 'submitted',
        message: `${amApproved} store${amApproved > 1 ? 's' : ''} approved by Area Manager — ready for your review`,
        batchId: latestBatch.id,
        urgent: false,
      });
    }

    if (latestBatch.submissionDeadline && pendingStores.length > 0) {
      const deadlineDate = new Date(latestBatch.submissionDeadline);
      const pendingCount = pendingStores.length;
      if (now > deadlineDate) {
        items.push({
          type: 'overdue',
          message: `${pendingCount} store${pendingCount > 1 ? 's have' : ' has'} not submitted — ${dateLabel} deadline passed`,
          batchId: latestBatch.id,
          urgent: true,
        });
      } else {
        const hoursLeft = Math.round((deadlineDate - now) / 3600000);
        if (hoursLeft <= 48) {
          items.push({
            type: 'deadline',
            message: `${pendingCount} store${pendingCount > 1 ? 's' : ''} still pending — ${dateLabel} deadline in ${hoursLeft < 1 ? '<1' : hoursLeft}h`,
            batchId: latestBatch.id,
            urgent: hoursLeft <= 12,
          });
        }
      }
    }

    const result = { items, count: items.length };
    sSet('admin:notifications', result, 30_000);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// """ Approve a pending (inactive) user — generates temp credentials and activates """"""""""
