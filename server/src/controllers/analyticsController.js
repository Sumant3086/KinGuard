import prisma from '../config/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';

// Risk weight per shrinkage category — higher = more concern for L&P
const CATEGORY_RISK = {
  'Theft':      5,
  'Damage':     3,
  'Expiry':     3,
  'In Transit': 2,
  'Supplier':   2,
  'Dented':     1,
  'Miscount':   1,
  'Transfer':   0,
  'Other':      1,
};

function categoryScore(categories) {
  if (!categories || categories.length === 0) return 0;
  const max = Math.max(...categories.map(c => CATEGORY_RISK[c] ?? 1));
  return (max / 5) * 100; // normalise to 0–100
}

// ── Store + SKU risk scores (features 11, 13, 14) ────────────────────────────

export async function getRiskScores(req, res, next) {
  try {
    const cycles = Math.max(1, Math.min(parseInt(req.query.cycles) || 6, 12));

    const batches = await prisma.uploadBatch.findMany({
      where: { isDeleted: false, status: 'COMPLETED' },
      orderBy: { inventoryDate: 'desc' },
      take: cycles,
      select: { id: true, inventoryDate: true },
    });
    if (batches.length === 0) return res.json({ stores: [], skus: [], cycles: 0 });

    const batchIds     = batches.map(b => b.id);
    const latestBatchId = batchIds[0];
    const priorBatchIds = batchIds.slice(1);

    const [stores, latestStats, priorStats, categoriesRaw] = await Promise.all([
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, storeCode: true, storeName: true },
      }),
      // Latest cycle stats per store
      prisma.$queryRaw`
        SELECT
          ir."storeId"::int,
          COUNT(*)::int                                                        AS "totalItems",
          COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::int AS "shortageCount",
          COUNT(CASE WHEN ir."isRepeat" = true                           THEN 1 END)::int AS "repeatCount",
          COUNT(CASE WHEN ir.status='SUBMITTED'                          THEN 1 END)::int AS "submittedCount"
        FROM "InventoryRecord" ir
        WHERE ir."batchId" = ${latestBatchId}
        GROUP BY ir."storeId"
      `,
      // Prior cycles — for trend computation
      priorBatchIds.length > 0 ? prisma.$queryRaw`
        SELECT
          ir."storeId"::int,
          ir."batchId"::int,
          COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::int AS "shortageCount",
          COUNT(CASE WHEN ir.status='SUBMITTED'                        THEN 1 END)::int AS "submitted"
        FROM "InventoryRecord" ir
        WHERE ir."batchId" = ANY(${priorBatchIds})
        GROUP BY ir."storeId", ir."batchId"
      ` : Promise.resolve([]),
      // Categories of shortages in the latest cycle
      prisma.inventoryRecord.findMany({
        where: { batchId: latestBatchId, status: 'SUBMITTED', difference: { lt: 0 }, shrinkageCategory: { not: null } },
        select: { storeId: true, shrinkageCategory: true },
      }),
    ]);

    // Build category map per store
    const catMap = new Map();
    for (const r of categoriesRaw) {
      if (!catMap.has(r.storeId)) catMap.set(r.storeId, []);
      if (r.shrinkageCategory) catMap.get(r.storeId).push(r.shrinkageCategory);
    }

    // Build prior rate map per store
    const priorMap = new Map();
    for (const r of priorStats) {
      if (!priorMap.has(r.storeId)) priorMap.set(r.storeId, []);
      const rate = r.submitted > 0 ? (r.shortageCount / r.submitted) * 100 : 0;
      priorMap.get(r.storeId).push(rate);
    }

    const latestMap = new Map(latestStats.map(r => [r.storeId, r]));

    // Score each store
    const scored = stores
      .map(store => {
        const latest = latestMap.get(store.id);
        if (!latest) return null;

        const shortageRate = latest.submittedCount > 0
          ? Math.round((latest.shortageCount / latest.submittedCount) * 1000) / 10
          : 0;
        const repeatRate = latest.shortageCount > 0
          ? Math.round((latest.repeatCount / latest.shortageCount) * 100)
          : 0;

        const cats      = catMap.get(store.id) || [];
        const catScr    = categoryScore(cats);
        const topCat    = cats.length > 0
          ? cats.sort((a, b) => (CATEGORY_RISK[b] ?? 1) - (CATEGORY_RISK[a] ?? 1))[0]
          : null;

        const priorRates = priorMap.get(store.id) || [];
        const priorAvg   = priorRates.length > 0
          ? priorRates.reduce((s, r) => s + r, 0) / priorRates.length : 0;
        const trendBonus = shortageRate > priorAvg
          ? Math.min((shortageRate - priorAvg) * 2, 100) : 0;
        const trend      = shortageRate > priorAvg + 1 ? 'up'
                          : shortageRate < priorAvg - 1 ? 'down' : 'flat';

        const riskScore = Math.min(Math.round(
          (shortageRate * 0.40) +
          (repeatRate   * 0.25) +
          (catScr       * 0.25) +
          (trendBonus   * 0.10)
        ), 100);

        return { storeId: store.id, storeCode: store.storeCode, storeName: store.storeName, shortageRate, repeatRate, topCategory: topCat, riskScore, trend };
      })
      .filter(Boolean)
      .sort((a, b) => b.riskScore - a.riskScore);

    // Add percentile rank (0 = safest, 100 = riskiest)
    const total = scored.length;
    const storeScores = scored.map((s, i) => ({
      ...s,
      percentile: total > 1 ? Math.round(((total - i - 1) / (total - 1)) * 100) : 50,
    }));

    // Top risky SKUs across all cycles — group only by materialCode so the same
    // item doesn't appear multiple times in the results with different categories.
    // Pick the highest-risk category for each SKU.
    const skuRaw = await prisma.$queryRaw`
      SELECT
        ir."materialCode",
        ir."materialName",
        COUNT(DISTINCT ir."storeId")::int                                    AS "affectedStores",
        COUNT(DISTINCT ir."batchId")::int                                    AS "cyclesWithShortage",
        ROUND(SUM(ABS(ir.difference))::numeric, 1)::float                   AS "totalUnitsLost",
        MODE() WITHIN GROUP (ORDER BY ir."shrinkageCategory")                AS "topCategory"
      FROM "InventoryRecord" ir
      WHERE ir."batchId" = ANY(${batchIds})
        AND ir.status = 'SUBMITTED'
        AND ir.difference < 0
      GROUP BY ir."materialCode", ir."materialName"
      ORDER BY COUNT(DISTINCT ir."batchId") DESC, COUNT(DISTINCT ir."storeId") DESC
      LIMIT 20
    `;

    const topSkus = skuRaw
      .map(r => {
        const cw        = CATEGORY_RISK[r.topCategory] ?? 1;
        const freq      = cycles > 0 ? r.cyclesWithShortage / cycles : 0;
        const spread    = total > 0 ? r.affectedStores / total : 0;
        const riskScore = Math.min(Math.round(freq * cw * spread * 100), 100);
        return {
          materialCode:       r.materialCode,
          materialName:       r.materialName,
          affectedStores:     r.affectedStores,
          cyclesWithShortage: Number(r.cyclesWithShortage),
          totalCycles:        cycles,
          category:           r.topCategory,
          totalUnitsLost:     Number(r.totalUnitsLost),
          riskScore,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    res.json({ stores: storeScores, skus: topSkus, cycles, latestBatchId });
  } catch (error) { next(error); }
}

// ── Year-over-year trend comparison (feature 12) ──────────────────────────────

export async function getTrendsYoY(req, res, next) {
  try {
    const cycles      = Math.max(1, Math.min(parseInt(req.query.cycles) || 6, 12));
    const compareYear = parseInt(req.query.compareYear);
    if (!compareYear || isNaN(compareYear) || compareYear < 2000 || compareYear > 2100) {
      throw new AppError('compareYear must be a valid year (e.g. 2025)', 400);
    }

    // Current: latest N batches regardless of year
    const currentBatches = (await prisma.uploadBatch.findMany({
      where: { isDeleted: false, status: 'COMPLETED' },
      orderBy: { inventoryDate: 'desc' },
      take: cycles,
      select: { id: true, inventoryDate: true },
    })).reverse();

    // Comparison year: all batches in that calendar year (up to cycles)
    const comparisonBatches = await prisma.uploadBatch.findMany({
      where: {
        isDeleted: false,
        status: 'COMPLETED',
        inventoryDate: {
          gte: new Date(`${compareYear}-01-01T00:00:00Z`),
          lte: new Date(`${compareYear}-12-31T23:59:59Z`),
        },
      },
      orderBy: { inventoryDate: 'asc' },
      take: cycles,
      select: { id: true, inventoryDate: true },
    });

    const allIds = [...new Set([...currentBatches, ...comparisonBatches].map(b => b.id))];
    if (allIds.length === 0) return res.json({ current: { batches: [], rates: [] }, comparison: { batches: [], rates: [] } });

    const rows = await prisma.$queryRaw`
      SELECT
        ir."batchId"::int,
        COUNT(*)::int                                                        AS "total",
        COUNT(CASE WHEN ir.status='SUBMITTED' THEN 1 END)::int                AS "submitted",
        COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::int AS "shortages"
      FROM "InventoryRecord" ir
      WHERE ir."batchId" = ANY(${allIds})
      GROUP BY ir."batchId"
    `;
    // Share of counted items — consistent with the dashboard, trends and risk scores
    const rateMap = new Map(rows.map(r => [
      r.batchId,
      r.submitted > 0 ? Math.round((r.shortages / r.submitted) * 1000) / 10 : 0,
    ]));

    res.json({
      current: {
        batches: currentBatches,
        rates:   currentBatches.map(b => ({ batchId: b.id, inventoryDate: b.inventoryDate, rate: rateMap.get(b.id) ?? null })),
      },
      comparison: {
        batches: comparisonBatches,
        rates:   comparisonBatches.map(b => ({ batchId: b.id, inventoryDate: b.inventoryDate, rate: rateMap.get(b.id) ?? null })),
      },
    });
  } catch (error) { next(error); }
}

// ── Executive summary PDF (feature 15) ────────────────────────────────────────

export async function downloadExecutiveSummary(req, res, next) {
  try {
    const latestBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED', isDeleted: false },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true },
    });
    if (!latestBatch) throw new AppError('No completed cycles found', 404);

    const priorBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED', isDeleted: false, id: { not: latestBatch.id } },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true },
    });

    const [networkStats, storeStats, catStats, storeCount, priorStats] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int                                                         AS "total",
          COUNT(CASE WHEN status='SUBMITTED' THEN 1 END)::int                    AS "submitted",
          COUNT(CASE WHEN difference < 0 AND status='SUBMITTED' THEN 1 END)::int AS "shortages",
          COUNT(CASE WHEN difference > 0 AND status='SUBMITTED' THEN 1 END)::int AS "excess",
          COUNT(CASE WHEN difference = 0 AND status='SUBMITTED' THEN 1 END)::int AS "matched",
          COUNT(DISTINCT "storeId")::int                                        AS "stores"
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id}
      `,
      prisma.$queryRaw`
        SELECT
          s."storeName",
          COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::int AS "shortages",
          COUNT(CASE WHEN ir.status='SUBMITTED'                        THEN 1 END)::int AS "submitted"
        FROM "InventoryRecord" ir
        JOIN "Store" s ON s.id = ir."storeId"
        WHERE ir."batchId" = ${latestBatch.id}
        GROUP BY s."storeName"
        HAVING COUNT(CASE WHEN ir.status='SUBMITTED' THEN 1 END) > 0
        ORDER BY (COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::float /
                  NULLIF(COUNT(CASE WHEN ir.status='SUBMITTED' THEN 1 END), 0)) DESC NULLS LAST
        LIMIT 5
      `,
      prisma.inventoryRecord.groupBy({
        by: ['shrinkageCategory'],
        where: { batchId: latestBatch.id, status: 'SUBMITTED', difference: { lt: 0 }, shrinkageCategory: { not: null } },
        _count: true,
        orderBy: { _count: { shrinkageCategory: 'desc' } },
        take: 5,
      }),
      prisma.store.count({ where: { isActive: true } }),
      priorBatch ? prisma.$queryRaw`
        SELECT COUNT(*)::int AS "total",
               COUNT(CASE WHEN status='SUBMITTED' THEN 1 END)::int AS "submitted",
               COUNT(CASE WHEN difference < 0 AND status='SUBMITTED' THEN 1 END)::int AS "shortages"
        FROM "InventoryRecord" WHERE "batchId" = ${priorBatch.id}
      ` : Promise.resolve(null),
    ]);

    const net          = networkStats[0] ?? {};
    // Denominator is submitted items, matching the per-store table below and the
    // dashboard/risk scores. Dividing by total would make this headline KPI disagree
    // with the Top Risk Stores table printed on the same page.
    const shortageRate = net.submitted > 0 ? Math.round((net.shortages / net.submitted) * 1000) / 10 : 0;
    const prior        = priorStats?.[0];
    const priorRate    = prior?.submitted > 0 ? Math.round((prior.shortages / prior.submitted) * 1000) / 10 : null;
    const delta        = priorRate !== null ? Math.round((shortageRate - priorRate) * 10) / 10 : null;
    const trendText    = delta === null ? '' : delta > 0 ? `+${delta}pp vs prior` : delta < 0 ? `${delta}pp vs prior` : 'Flat vs prior';
    const trendColor   = delta === null ? '#64748b' : delta > 0 ? '#dc2626' : '#16a34a';

    const cycleDate = latestBatch.inventoryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today     = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const { buildPDF, baseDocDef, tableLayout } = await import('../services/pdfService.js');

    const RED = '#dc2626';

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Executive Summary', subtitle: `Inventory Cycle: ${cycleDate}` }),
      pageOrientation: 'portrait',
      pageMargins: [36, 72, 36, 44],
      content: [
        // KPI row
        {
          columns: [
            {
              stack: [
                { text: `${shortageRate}%`, fontSize: 28, bold: true, color: shortageRate >= 10 ? RED : shortageRate >= 5 ? '#d97706' : '#16a34a', alignment: 'center' },
                { text: 'Network Shortage Rate', fontSize: 9, color: '#64748b', alignment: 'center' },
                trendText ? { text: trendText, fontSize: 9, bold: true, color: trendColor, alignment: 'center', margin: [0, 2, 0, 0] } : {},
              ],
              margin: [0, 0, 8, 0],
            },
            {
              stack: [
                { text: `${net.shortages ?? 0}`, fontSize: 28, bold: true, color: '#dc2626', alignment: 'center' },
                { text: 'Shortage Items', fontSize: 9, color: '#64748b', alignment: 'center' },
              ],
              margin: [0, 0, 8, 0],
            },
            {
              stack: [
                { text: `${net.matched ?? 0}`, fontSize: 28, bold: true, color: '#16a34a', alignment: 'center' },
                { text: 'Matched Items', fontSize: 9, color: '#64748b', alignment: 'center' },
              ],
              margin: [0, 0, 8, 0],
            },
            {
              stack: [
                { text: `${net.stores ?? 0}/${storeCount}`, fontSize: 28, bold: true, color: '#1e293b', alignment: 'center' },
                { text: 'Stores Counted', fontSize: 9, color: '#64748b', alignment: 'center' },
              ],
            },
          ],
          margin: [0, 0, 0, 24],
        },

        // Top risk stores
        { text: 'TOP RISK STORES', fontSize: 8, bold: true, color: RED, letterSpacing: 1, margin: [0, 0, 0, 6] },
        storeStats.length > 0 ? {
          table: {
            headerRows: 1,
            widths: ['*', 50, 50],
            body: [
              [{ text: 'Store', style: 'th' }, { text: 'Shortages', style: 'th', alignment: 'right' }, { text: 'Rate', style: 'th', alignment: 'right' }],
              ...storeStats.map(s => {
                const r = s.submitted > 0 ? Math.round((s.shortages / s.submitted) * 1000) / 10 : 0;
                return [
                  s.storeName,
                  { text: String(s.shortages), alignment: 'right' },
                  { text: `${r}%`, alignment: 'right', bold: true, color: r >= 10 ? RED : r >= 5 ? '#d97706' : '#16a34a' },
                ];
              }),
            ],
          },
          layout: tableLayout(),
          margin: [0, 0, 0, 20],
        } : { text: 'No submission data available for this cycle.', fontSize: 9, color: '#64748b', margin: [0, 0, 0, 20] },

        // Top shrinkage categories
        { text: 'TOP SHRINKAGE CATEGORIES', fontSize: 8, bold: true, color: RED, letterSpacing: 1, margin: [0, 0, 0, 6] },
        catStats.length > 0 ? {
          table: {
            headerRows: 1,
            widths: ['*', 60],
            body: [
              [{ text: 'Category', style: 'th' }, { text: 'Items', style: 'th', alignment: 'right' }],
              ...catStats.map(c => [
                c.shrinkageCategory ?? 'Uncategorized',
                { text: String(c._count), alignment: 'right' },
              ]),
            ],
          },
          layout: tableLayout(),
          margin: [0, 0, 0, 24],
        } : { text: 'No shrinkage categories recorded.', fontSize: 9, color: '#64748b', margin: [0, 0, 0, 24] },

        // Footer note
        {
          text: `Generated on ${today} · Covers inventory cycle dated ${cycleDate}`,
          fontSize: 8,
          color: '#94a3b8',
          italics: true,
          alignment: 'right',
        },
      ],
    });

    createAuditLog({
      userId: req.user.id, action: 'DOWNLOAD_EXECUTIVE_SUMMARY',
      entityType: 'UPLOAD_BATCH', entityId: latestBatch.id,
      metadata: { cycleDate, shortageRate },
    }).catch(() => {});

    const dateStr = latestBatch.inventoryDate.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_Executive_Summary_${dateStr}.pdf"`);
    res.end(pdfBuffer);
  } catch (error) { next(error); }
}
