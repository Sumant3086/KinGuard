// The inventory upload pipeline: preview, publish, and the sample template.

import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../services/auditService.js';
import { logger, errorDetails } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { sInvalidate } from '../../services/serverCache.js';
import { MAX_MATERIAL_CODE_LEN, MAX_MATERIAL_NAME_LEN, MAX_REMARKS_LEN, MAX_STORE_CODE_LEN, parseUserDate, withDbRetry } from './shared.js';

// Shared column name aliases for Excel/CSV parsing
const COLUMN_MAP = {
  storeCode:      ['Plant', 'Plant Code', 'Store Code', 'Store code', 'StoreCode', 'Store', 'store_code', 'STORE CODE', 'PLANT', 'PLANT CODE'],
  materialCode:   ['Material', 'Material Code', 'Material code', 'MaterialCode', 'material_code', 'SKU', 'MATERIAL'],
  materialName:   ['Material Description', 'Material Name', 'MaterialName', 'Description', 'material_name', 'MATERIAL DESCRIPTION'],
  systemQuantity: ['System  Stock', 'System Stock', 'SYS', 'System Quantity', 'SystemQuantity', 'system_quantity', 'QTY', 'SYSTEM QUANTITY'],
  remarks:        ['col_10', 'Remarks', 'remarks', 'REMARKS', 'Remark', 'Note'],
};

function findColumn(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }
  return null;
}

// Safely extract plain text from any ExcelJS cell value.
// Handles: plain string, number, boolean, RichText ({richText:[{text}]}), Hyperlink ({text}).
export function cellText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string')  return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val?.richText)) return val.richText.map(r => r.text ?? '').join('').trim();
  if (val?.text !== undefined)  return String(val.text).trim();
  return String(val).trim();
}

export async function parseFileToRows(file) {
  // Decide by extension as well as mimetype. The upload filter accepts a .csv whatever the
  // browser labels it, and a Windows machine with Excel installed reports .csv as
  // application/vnd.ms-excel. Checking the mimetype alone sent those real CSV files into
  // the xlsx parser, where they died on a raw JSZip "is this a zip file?" that reached the
  // user as a 500 "Something went wrong on our end".
  const name = (file.originalname || '').toLowerCase();
  if (file.mimetype.includes('csv') || name.endsWith('.csv')) {
    return parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  }

  const workbook = new ExcelJS.Workbook();
  // A file that is not a readable workbook is the uploader's mistake, not a server fault,
  // so it gets a 400 that says what to do rather than a 500 that says nothing.
  try {
    await workbook.xlsx.load(file.buffer);
  } catch {
    throw new AppError('That file could not be read as a spreadsheet. Save it as .xlsx or .csv and try again', 400);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new AppError('That workbook has no sheets in it', 400);
  // Map column number -> header name; bold/rich-text headers are flattened to plain string
  const headerMap = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headerMap[colNumber] = cellText(cell.value) || `col_${colNumber}`;
  });
  const rows = [];
  worksheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) return;
    const rowData = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headerMap[colNumber] ?? `col_${colNumber}`;
      // Flatten RichText data cells too (e.g. bold material codes)
      const v = cell.value;
      rowData[key] = (v && typeof v === 'object' && (Array.isArray(v.richText) || v.text !== undefined))
        ? cellText(v)
        : v;
    });
    if (Object.keys(rowData).length > 0) rows.push(rowData);
  });
  return rows;
}

export async function uploadInventory(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('Please select a file to upload', 400);
    }

    const { inventoryDate, submissionDeadline } = req.body;
    if (!inventoryDate) {
      throw new AppError('Please select an inventory date for this cycle', 400);
    }

    const targetDate     = parseUserDate(inventoryDate, 'inventoryDate');
    const parsedDeadline = parseUserDate(submissionDeadline, 'submissionDeadline');

    // A deadline that is already past (or before the count date) creates a cycle that
    // is locked the moment it appears — stores can see it but can never submit to it.
    if (parsedDeadline) {
      if (parsedDeadline <= new Date()) {
        throw new AppError('Submission deadline must be in the future', 400);
      }
      if (parsedDeadline < targetDate) {
        throw new AppError('Submission deadline cannot be before the inventory date', 400);
      }
    }

    const windowStart = new Date(targetDate); windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd   = new Date(targetDate); windowEnd.setDate(windowEnd.getDate() + 3);
    // Only warn about COMPLETED batches. A PENDING batch is a half-finished upload
    // (the row is created before rows are parsed), not a real cycle, so it must not
    // block a genuine upload for the same date.
    const existingBatch = await withDbRetry(() => prisma.uploadBatch.findFirst({
      where: { inventoryDate: { gte: windowStart, lte: windowEnd }, status: 'COMPLETED', isDeleted: false },
      select: { id: true, inventoryDate: true, originalFileName: true },
    }));
    if (existingBatch) {
      if (req.query.force !== 'true') {
        return res.status(409).json({
          warning: 'duplicate_batch',
          message: `A batch already exists for ${new Date(existingBatch.inventoryDate).toLocaleDateString()}. Send with ?force=true to proceed anyway.`,
          existingBatch: { id: existingBatch.id, inventoryDate: existingBatch.inventoryDate, fileName: existingBatch.originalFileName },
        });
      }
    }

    const file = req.file;
    const rows = await parseFileToRows(file);

    const MAX_UPLOAD_ROWS = 50_000;
    if (rows.length > MAX_UPLOAD_ROWS) {
      throw new AppError(
        `File contains ${rows.length.toLocaleString()} rows. Maximum is ${MAX_UPLOAD_ROWS.toLocaleString()} rows per upload. Split the file and upload in parts.`,
        413
      );
    }

    // Create upload batch
    const batch = await prisma.uploadBatch.create({
      data: {
        originalFileName: file.originalname,
        uploadedBy: req.user.id,
        inventoryDate: targetDate,
        submissionDeadline: parsedDeadline,
        totalRows: rows.length,
        successfulRows: 0,
        rejectedRows: 0,
        status: 'PENDING',
      },
    });

    const errors = [];
    const successfulRecords = [];

    // Auto-create any stores found in the file that don't exist yet
    const fileStoreCodes = new Set();
    for (const row of rows) {
      const code = findColumn(row, COLUMN_MAP.storeCode)?.toString().trim().toUpperCase();
      if (code) fileStoreCodes.add(code);
    }
    let existingStores;
    try {
      existingStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    } catch {
      await prisma.$connect();
      existingStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    }
    const existingCodes = new Set(existingStores.map(s => s.storeCode));
    const newStoreCodes = [...fileStoreCodes].filter(c => !existingCodes.has(c));
    const MAX_AUTO_STORES = 50;
    if (newStoreCodes.length > MAX_AUTO_STORES) {
      await prisma.uploadBatch.delete({ where: { id: batch.id } });
      return res.status(422).json({
        error: `File contains ${newStoreCodes.length} unknown store codes. Maximum ${MAX_AUTO_STORES} new stores can be auto-created per upload. Create the stores manually first, then re-upload.`,
        newStoreCodes: newStoreCodes.slice(0, 20),
      });
    }
    if (newStoreCodes.length > 0) {
      await prisma.store.createMany({
        data: newStoreCodes.map(code => ({ storeCode: code, storeName: `Store ${code}`, isActive: true })),
        skipDuplicates: true,
      });
    }

    // Reload store map after potential creation
    const allStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    const storeMap = new Map(allStores.map(s => [s.storeCode, s.id]));

    // Auto-create inactive placeholder users for every newly created store.
    // Accounts are inactive until an admin approves them in User Management.
    // A fresh password is generated at approval time, not here.
    const autoCreatedUsers = [];
    if (newStoreCodes.length > 0) {
      const placeholder = await bcrypt.hash(randomBytes(16).toString('hex'), 10);
      
      // Build list of users to create
      const usersToCreate = [];
      for (const code of newStoreCodes) {
        const storeId = storeMap.get(code);
        if (!storeId) continue;
        const employeeId = `MGR${code}`;
        usersToCreate.push({
          employeeId,
          name: `Manager ${code}`,
          passwordHash: placeholder,
          role: 'STORE_MANAGER',
          storeId,
          isActive: false,
          pendingApproval: true,
          source: 'AUTO_STORE',
        });
        autoCreatedUsers.push({ employeeId, storeCode: code });
      }
      
      // Batch create all users at once (much faster!)
      if (usersToCreate.length > 0) {
        await prisma.user.createMany({
          data: usersToCreate,
          skipDuplicates: true, // Skip if employeeId already exists
        });
      }
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row and 0-index

      try {
        const storeCode = findColumn(row, COLUMN_MAP.storeCode)?.toString().trim().toUpperCase();
        const materialCode = findColumn(row, COLUMN_MAP.materialCode)?.toString().trim();
        const materialDescription = findColumn(row, COLUMN_MAP.materialName)?.toString().trim();
        const rawQty = findColumn(row, COLUMN_MAP.systemQuantity);
        const materialName = materialDescription || materialCode;

        if (!storeCode) {
          errors.push({ row: rowNum, error: 'Missing Plant Code' });
          continue;
        }
        if (storeCode.length > MAX_STORE_CODE_LEN) {
          errors.push({ row: rowNum, error: `Plant Code too long (max ${MAX_STORE_CODE_LEN} characters)` });
          continue;
        }
        if (!materialCode) {
          errors.push({ row: rowNum, error: 'Missing Material Code' });
          continue;
        }
        if (materialCode.length > MAX_MATERIAL_CODE_LEN) {
          errors.push({ row: rowNum, error: `Material Code too long (max ${MAX_MATERIAL_CODE_LEN} characters)` });
          continue;
        }
        if (!materialName) {
          errors.push({ row: rowNum, error: 'Missing Material Description' });
          continue;
        }
        if (materialName.length > MAX_MATERIAL_NAME_LEN) {
          errors.push({ row: rowNum, error: `Material Description too long (max ${MAX_MATERIAL_NAME_LEN} characters)` });
          continue;
        }

        // System quantity is optional. A blank cell stays blank (null) rather than
        // becoming 0, so the store manager is asked to supply the figure instead of
        // being shown a confident zero nobody entered. An explicit 0 in the file is a
        // real figure and is kept as 0.
        const qtyProvided = rawQty !== null && rawQty !== undefined && String(rawQty).trim() !== '';
        const qty = qtyProvided ? parseFloat(rawQty) : null;
        if (qtyProvided && (isNaN(qty) || qty < 0)) {
          errors.push({ row: rowNum, error: 'Invalid System Quantity' });
          continue;
        }

        const storeId = storeMap.get(storeCode);
        if (!storeId) {
          errors.push({ row: rowNum, error: `Store not found: ${storeCode}` });
          continue;
        }

        let remarks = findColumn(row, COLUMN_MAP.remarks)?.toString().trim() || null;
        if (remarks && remarks.length > MAX_REMARKS_LEN) remarks = remarks.slice(0, MAX_REMARKS_LEN);

        successfulRecords.push({
          batchId: batch.id,
          storeId,
          materialCode,
          materialName,
          systemQuantity: qty,
          remarks,
          status: 'PENDING',
        });
      } catch (error) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    // Insert successful records — skipDuplicates prevents re-uploading the same
    // (batch, store, material) from creating duplicate rows. Use the count Prisma
    // returns rather than successfulRecords.length: when a file repeats a
    // plant+material pair, the repeat is silently skipped and the two numbers differ.
    let insertedRows = 0;
    if (successfulRecords.length > 0) {
      const { count } = await prisma.inventoryRecord.createMany({
        data: successfulRecords,
        skipDuplicates: true,
      });
      insertedRows = count;
    }
    const duplicateRows = successfulRecords.length - insertedRows;
    
    // Report duplicate details so admin knows which rows were skipped
    if (duplicateRows > 0) {
      const seen = new Set();
      const duplicateDetails = [];
      for (const rec of successfulRecords) {
        const key = `${rec.storeId}_${rec.materialCode}`;
        if (seen.has(key)) {
          const store = allStores.find(s => s.id === rec.storeId);
          duplicateDetails.push({
            store: store?.storeCode || 'Unknown',
            material: rec.materialCode,
          });
        }
        seen.add(key);
      }
      if (duplicateDetails.length > 0) {
        errors.push({
          row: 'Multiple',
          error: `${duplicateRows} duplicate row(s) skipped: same Store+Material combination appears multiple times in your file`,
          details: duplicateDetails.slice(0, 20),
        });
      }
    }

    // If every row failed, delete the orphan batch and surface a clean error
    if (successfulRecords.length === 0) {
      await prisma.uploadBatch.delete({ where: { id: batch.id } });
      return res.status(422).json({
        error: 'No valid rows found — batch rejected. Check your file format.',
        errors: errors.slice(0, 20),
        batchDeleted: true,
      });
    }

    // Update batch. Every row either produced an error or a record, and the
    // all-rows-failed case already returned above, so the batch is COMPLETED here.
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        successfulRows: insertedRows,
        rejectedRows: errors.length,
        status: 'COMPLETED',
      },
    });

    // Every store in the file has a new cycle waiting, and so does their area manager.
    // Without busting those keys the cycle stays invisible for up to a minute.
    const affectedStoreIds = [...new Set(successfulRecords.map(r => r.storeId))];
    const affectedAms = await prisma.store.findMany({
      where: { id: { in: affectedStoreIds }, areaManagerId: { not: null } },
      select: { areaManagerId: true },
      distinct: ['areaManagerId'],
    }).catch(() => []);

    // An upload can also auto-create stores and pending manager accounts, so the
    // admin store and user lists are stale too. A new cycle is likewise a new point
    // on the trends chart — closeBatch and deleteBatch already bust those keys, and
    // leaving them out here left Analytics on the pre-upload series for five minutes.
    sInvalidate('admin:batches', 'admin:notifications', 'admin:stores', 'admin:users',
      'admin:trends:6', 'admin:trends:8', 'admin:trends:12',
      ...affectedStoreIds.flatMap(id => [`store:dashboard:${id}`, `store:notifications:${id}`]),
      ...affectedAms.flatMap(a => [`am:batches:${a.areaManagerId}`, `am:notifications:${a.areaManagerId}`, `am:stores:${a.areaManagerId}`]));

    await createAuditLog({
      userId: req.user.id,
      action: 'UPLOAD_INVENTORY',
      entityType: 'UPLOAD_BATCH',
      entityId: batch.id,
      metadata: {
        fileName: file.originalname,
        totalRows: rows.length,
        successfulRows: insertedRows,
        duplicateRows,
        rejectedRows: errors.length,
      },
    });

    sInvalidate('admin:dashboard');

    // Respond immediately — don't block the upload on email delivery
    res.status(201).json({
      batchId: batch.id,
      totalRows: rows.length,
      successfulRows: insertedRows,
      // Rows that parsed cleanly but repeated a plant+material already in this cycle
      duplicateRows: duplicateRows > 0 ? duplicateRows : undefined,
      rejectedRows: errors.length,
      errors: errors.slice(0, 50),
      autoCreatedUsers: autoCreatedUsers.length > 0 ? autoCreatedUsers : undefined,
    });

    // Store managers get a bell notification only. Area managers get an email.
    prisma.user.findMany({
      where: { role: 'AREA_MANAGER', isActive: true, pendingApproval: false, email: { not: null } },
      select: { id: true, name: true, email: true, managedStores: { select: { id: true } } },
    }).then(async areaManagers => {
      if (!areaManagers.length) return;
      const { sendNewCycleEmailAM } = await import('../../services/emailService.js');
      const amWithCount = areaManagers.map(am => ({ ...am, storeCount: am.managedStores.length }));
      // Pass the parsed Date objects, not the raw request strings — parseUserDate accepts
      // formats that a bare new Date() in the email template would render "Invalid Date".
      sendNewCycleEmailAM({ managers: amWithCount, inventoryDate: targetDate, deadline: parsedDeadline })
        .then(r => logger.info('Upload AM email result', { sent: r.sent, failed: r.failed }))
        .catch(e => logger.error('Upload AM email send error', errorDetails(e)));
    }).catch(e => logger.error('Upload AM query failed', errorDetails(e)));
  } catch (error) {
    next(error);
  }
}

export async function previewUpload(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('Please select a file to upload', 400);
    }

    const { inventoryDate } = req.body;
    if (!inventoryDate) {
      throw new AppError('Please select an inventory date for this cycle', 400);
    }

    const file = req.file;
    const rows = await parseFileToRows(file);

    if (rows.length === 0) {
      throw new AppError('The file appears to be empty — no data rows were found', 400);
    }

    const MAX_PREVIEW_ROWS = 50_000;
    if (rows.length > MAX_PREVIEW_ROWS) {
      throw new AppError(
        `File contains ${rows.length.toLocaleString()} rows. Maximum is ${MAX_PREVIEW_ROWS.toLocaleString()} rows per upload. Split the file and upload in parts.`,
        413
      );
    }

    // Fetch all plant codes for validation — retry once on cold-start connection failure
    const stores = await withDbRetry(() =>
      prisma.store.findMany({ select: { storeCode: true, storeName: true } })
    );

    const storeMap = new Map(stores.map(s => [s.storeCode, s.storeName]));

    const preview = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    // Validate ALL rows for accurate stats; only include first 100 rows in the preview array
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const storeCode       = findColumn(row, COLUMN_MAP.storeCode)?.toString().trim().toUpperCase();
      const materialCode    = findColumn(row, COLUMN_MAP.materialCode)?.toString().trim();
      const materialDesc    = findColumn(row, COLUMN_MAP.materialName)?.toString().trim();
      const rawQty          = findColumn(row, COLUMN_MAP.systemQuantity);
      const materialName    = materialDesc || materialCode;
      const remarks         = findColumn(row, COLUMN_MAP.remarks)?.toString().trim() || '';

      const errors   = [];
      const warnings = [];

      if (!storeCode) {
        errors.push('Missing Plant Code');
      } else if (storeCode.length > MAX_STORE_CODE_LEN) {
        errors.push(`Plant Code too long (max ${MAX_STORE_CODE_LEN} chars)`);
      } else if (!storeMap.has(storeCode)) {
        warnings.push(`New plant will be created: ${storeCode}`);
      }

      if (!materialCode) {
        errors.push('Missing Material Code');
      } else if (materialCode.length > MAX_MATERIAL_CODE_LEN) {
        errors.push(`Material Code too long (max ${MAX_MATERIAL_CODE_LEN} chars)`);
      }

      // Blank stays blank in the preview too, so what the admin sees before committing
      // matches what the upload will actually store.
      let systemQty = null;
      if (rawQty !== null && rawQty !== undefined && String(rawQty).trim() !== '') {
        const qty = parseFloat(rawQty);
        if (isNaN(qty)) {
          errors.push('Invalid System Quantity (not a number)');
        } else if (qty < 0) {
          errors.push('Invalid System Quantity (negative)');
        } else {
          systemQty = qty;
        }
      }

      let status, message;
      if (errors.length > 0) {
        status = 'error'; message = errors.join('; '); errorCount++;
      } else if (warnings.length > 0) {
        status = 'warning'; message = warnings.join('; '); warningCount++;
      } else {
        status = 'valid'; message = 'OK'; validCount++;
      }

      // Only include the first 100 rows in the preview payload
      if (i < 100) {
        preview.push({
          row: rowNum,
          storeCode:      storeCode || '',
          storeName:      storeCode ? (storeMap.get(storeCode) || `(new) ${storeCode}`) : '',
          materialCode:   materialCode || '',
          materialName:   materialName || '',
          systemQuantity: systemQty,
          remarks,
          status,
          message,
        });
      }
    }

    res.json({
      fileName: file.originalname,
      inventoryDate,
      totalRows:   rows.length,
      previewRows: preview.length,
      statistics: {
        valid:    validCount,
        errors:   errorCount,
        warnings: warningCount,
      },
      preview,
      showingPartial: rows.length > 100,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadSampleTemplate(req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Inventory');

    // Columns: Plant | Material | Material Description | System Stock | Physical Stock
    // System Stock and Physical Stock are left blank for store managers to fill in
    ws.columns = [
      { header: 'Plant',                key: 'plant',          width: 14 },
      { header: 'Material',             key: 'material',       width: 18 },
      { header: 'Material Description', key: 'desc',           width: 36 },
      { header: 'System  Stock',        key: 'systemStock',    width: 16 },
      { header: 'Physical Stock',       key: 'physicalStock',  width: 16 },
    ];

    // Style header row — red brand colour
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    hRow.height = 22;

    // Freeze and filter
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

    // Sample rows — System Stock and Physical Stock left blank (to be filled by managers)
    const samples = [
      { plant: '2003', material: '1000013986', desc: 'Whisky Black Label 750Ml', systemStock: null, physicalStock: null },
      { plant: '2001', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
      { plant: '2003', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
      { plant: '2004', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
      { plant: '2005', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
    ];

    samples.forEach(row => ws.addRow(row));

    // Format Plant and Material as text to preserve leading zeros
    ws.getColumn('plant').numFmt    = '@';
    ws.getColumn('material').numFmt = '@';

    // Instructions sheet
    const info = workbook.addWorksheet('Instructions');
    info.getColumn(1).width = 75;
    const lines = [
      'KinMarche -- Inventory Upload Template',
      '',
      'HOW TO USE THIS TEMPLATE:',
      '  1. Fill in the Plant Code and Material columns for each item.',
      '  2. Leave System Stock and Physical Stock blank -- store managers fill these in.',
      '  3. Upload this file via the Upload page to create an inventory cycle.',
      '',
      'REQUIRED COLUMNS (accepted header names):',
      '  - Plant / Plant Code -> Your plant/store identifier',
      '  - Material / Material Code / SKU          -> Item code',
      '  - Material Description / Description      -> Item name',
      '',
      'COLUMNS FILLED BY STORE MANAGERS (leave blank in this file):',
      '  - System  Stock / System Stock -> Quantity per store ERP/records',
      '  - Physical Stock               -> Actual physical count',
      '',
      'NOTES:',
      '  - If a plant code in this file does not exist, it will be created automatically.',
      '  - Plant codes are matched exactly (case-sensitive).',
      '  - Maximum file size: 10 MB.',
      '  - Supported formats: .xlsx, .xls, .csv',
      '',
      'See the "Shrinkage Reference" sheet for all valid shrinkage categories and issue details.',
    ];
    lines.forEach((line, i) => {
      const cell = info.getCell(`A${i + 1}`);
      cell.value = line;
      if (i === 0) cell.font = { bold: true, size: 13 };
      if (line.startsWith('REQUIRED') || line.startsWith('OPTIONAL') || line.startsWith('NOTES') || line.startsWith('COLUMNS')) {
        cell.font = { bold: true };
      }
    });

    // Shrinkage Reference sheet — mirrors shrinkageCategories.js in the client UI
    const SHRINKAGE_CATEGORIES = {
      'Dented':     ['Minor dent to packaging, product is ok', 'Moderate dent to packaging, product with lesser impact', 'Direct dent to product, product not ok', 'Dented due to warehouse handling error', 'Dented during transit/shipping'],
      'Expiry':     ['Product has passed the expiry date', 'Product has passed the particular date', 'Expired stock identified during stock take', 'Expired stock designated for return to vendor', 'Expired stock designated for disposal'],
      'Damage':     ['Physical breakage of product/component', 'Physical scratches/abrasions on product/packaging', 'Water exposure damage', 'Fire/smoke exposure damage', 'Electrical malfunction/damage', 'Manufacturing defect identified', 'Damage incurred during customer return process', 'Unsaleable due to damage'],
      'In Transit': ['Overage, Shortage, Damage (OS&D) report for transit damage', 'Damage/issue due to cargo shift during transport', 'Environmental exposure during transit (e.g., temperature, humidity)', 'Pilferage suspected during transit', 'Damage incurred due to transport accident', 'Discrepancy between physical count and shipping documentation'],
      'Theft':      ['Suspected internal theft', 'Suspected external/shoplifting theft', 'CCTV evidence of theft', 'Theft during transit', 'No evidence — stock unaccounted for'],
      'Miscount':   ['Counting error by store team', 'Counting error — recount confirmed correct', 'System quantity mismatch (ERP error)', 'Stock in transit not yet received'],
      'Transfer':   ['Stock transferred to another store', 'Stock returned to warehouse', 'Inter-branch transfer in progress'],
      'Supplier':   ['Short delivery from supplier', 'Wrong quantity delivered by supplier', 'Supplier return in progress', 'Goods received note discrepancy'],
      'Other':      ['Quality control hold, pending further inspection/decision', 'Incorrect labeling identified on product/packaging', 'Product subject to manufacturer recall', 'Product deemed obsolete, no longer marketable', 'Inventory adjustment due to system error/discrepancy', 'Stock designated for donation', 'Stock designated for sampling/testing', 'Stock shared to national employees'],
    };

    const ref = workbook.addWorksheet('Shrinkage Reference');
    ref.getColumn(1).width = 18;
    ref.getColumn(2).width = 62;

    // Header row
    const refHeader = ref.getRow(1);
    refHeader.values = ['Category', 'Issue Detail'];
    refHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    refHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    refHeader.height = 20;
    ref.views = [{ state: 'frozen', ySplit: 1 }];

    const catColors = {
      'Dented':     'FFFFF3CD',
      'Expiry':     'FFFCE5CD',
      'Damage':     'FFFCD5D5',
      'In Transit': 'FFD5EAF5',
      'Other':      'FFE8E8E8',
    };

    let rowNum = 2;
    for (const [cat, reasons] of Object.entries(SHRINKAGE_CATEGORIES)) {
      const bgColor = catColors[cat] || 'FFFFFFFF';
      for (let i = 0; i < reasons.length; i++) {
        const row = ref.getRow(rowNum);
        row.values = [i === 0 ? cat : '', reasons[i]];
        row.getCell(1).font = { bold: i === 0, color: { argb: 'FF1E293B' } };
        row.getCell(2).font = { color: { argb: 'FF1E293B' } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        row.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
        row.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
        rowNum++;
      }
      // Empty separator row between categories
      rowNum++;
    }

    // Note at the bottom
    const noteRow = ref.getRow(rowNum + 1);
    noteRow.getCell(1).value = 'Note:';
    noteRow.getCell(1).font = { bold: true, italic: true, color: { argb: 'FF64748B' } };
    ref.getRow(rowNum + 2).getCell(1).value = 'For "Other" category, store managers may also type a custom issue detail in the text field.';
    ref.getRow(rowNum + 2).getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
    ref.mergeCells(rowNum + 2, 1, rowNum + 2, 2);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="KinGuard_InventoryTemplate.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// """ User deletion """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
