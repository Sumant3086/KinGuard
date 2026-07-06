import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import prisma from '../config/prisma.js';

export async function getDashboard(req, res, next) {
  try {
    // Get store statistics
    const totalStores = await prisma.store.count({ where: { isActive: true } });

    // Get latest batch
    const latestBatch = await prisma.uploadBatch.findFirst({
      orderBy: { inventoryDate: 'desc' },
    });

    if (!latestBatch) {
      return res.json({
        totalStores,
        storesPending: 0,
        storesSubmitted: 0,
        totalRecords: 0,
        matchedItems: 0,
        shortageItems: 0,
        excessItems: 0,
      });
    }

    // Get store submission status
    const storesWithRecords = await prisma.inventoryRecord.groupBy({
      by: ['storeId', 'status'],
      where: { batchId: latestBatch.id },
      _count: true,
    });

    const storeStatusMap = new Map();
    storesWithRecords.forEach((item) => {
      if (!storeStatusMap.has(item.storeId)) {
        storeStatusMap.set(item.storeId, { pending: 0, submitted: 0 });
      }
      const status = storeStatusMap.get(item.storeId);
      if (item.status === 'PENDING') {
        status.pending += item._count;
      } else {
        status.submitted += item._count;
      }
    });

    let storesPending = 0;
    let storesSubmitted = 0;
    storeStatusMap.forEach((status) => {
      if (status.pending > 0) {
        storesPending++;
      } else if (status.submitted > 0) {
        storesSubmitted++;
      }
    });

    // Get inventory statistics
    const records = await prisma.inventoryRecord.findMany({
      where: { batchId: latestBatch.id, status: 'SUBMITTED' },
    });

    const stats = {
      totalStores,
      storesPending,
      storesSubmitted,
      totalRecords: records.length,
      matchedItems: records.filter((r) => r.difference === 0).length,
      shortageItems: records.filter((r) => r.difference < 0).length,
      excessItems: records.filter((r) => r.difference > 0).length,
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
}

export async function getStores(req, res, next) {
  try {
    const stores = await prisma.store.findMany({
      orderBy: { storeCode: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            inventoryRecords: true,
          },
        },
      },
    });

    res.json(stores);
  } catch (error) {
    next(error);
  }
}

export async function createStore(req, res, next) {
  try {
    const { storeCode, storeName, isActive } = req.body;

    if (!storeCode || !storeName) {
      throw new AppError('Store code and name are required', 400);
    }

    const store = await prisma.store.create({
      data: {
        storeCode: storeCode.toString(),
        storeName,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_STORE',
      entityType: 'STORE',
      entityId: store.id,
      metadata: { storeCode, storeName },
    });

    res.status(201).json(store);
  } catch (error) {
    if (error.code === 'P2002') {
      next(new AppError('Store code already exists', 409));
    } else {
      next(error);
    }
  }
}

export async function updateStore(req, res, next) {
  try {
    const { id } = req.params;
    const { storeName, isActive } = req.body;

    const store = await prisma.store.update({
      where: { id: parseInt(id) },
      data: {
        storeName: storeName !== undefined ? storeName : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_STORE',
      entityType: 'STORE',
      entityId: store.id,
      metadata: { storeName, isActive },
    });

    res.json(store);
  } catch (error) {
    next(error);
  }
}

export async function getUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { employeeId: 'asc' },
      include: {
        store: {
          select: {
            id: true,
            storeCode: true,
            storeName: true,
          },
        },
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
        store: true,
      },
    });

    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    const { employeeId, name, password, role, storeId, isActive } = req.body;

    if (!employeeId || !name || !password || !role) {
      throw new AppError('Employee ID, name, password, and role are required', 400);
    }

    if (role === 'STORE_MANAGER' && !storeId) {
      throw new AppError('Store assignment is required for Store Managers', 400);
    }

    if (role === 'ADMIN' && storeId) {
      throw new AppError('Admin users cannot be assigned to a store', 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        employeeId,
        name,
        passwordHash,
        role,
        storeId: storeId ? parseInt(storeId) : null,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: {
        store: true,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: user.id,
      metadata: { employeeId, role, storeId },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      next(new AppError('Employee ID already exists', 409));
    } else {
      next(error);
    }
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, password, storeId, isActive } = req.body;

    const data = {
      name: name !== undefined ? name : undefined,
      storeId: storeId !== undefined ? (storeId ? parseInt(storeId) : null) : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
    };

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data,
      include: { store: true },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: user.id,
      metadata: { name, storeId, isActive },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    next(error);
  }
}

export async function uploadInventory(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('File is required', 400);
    }

    const { inventoryDate } = req.body;
    if (!inventoryDate) {
      throw new AppError('Inventory date is required', 400);
    }

    const file = req.file;
    let rows = [];

    // Parse file based on type
    if (file.mimetype.includes('csv')) {
      rows = parse(file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      // Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer);
      const worksheet = workbook.worksheets[0];

      const headers = [];
      worksheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value.toString().trim());
      });

      worksheet.eachRow((row, rowIndex) => {
        if (rowIndex === 1) return; // Skip header
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          rowData[headers[colNumber - 1]] = cell.value;
        });
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
    }

    // Debug: Log the headers from the first row
    if (rows.length > 0) {
      console.log('📋 Excel Headers Found:', Object.keys(rows[0]));
    }

    // Map column names (supports both generic and business-specific formats)
    const columnMap = {
      storeCode: [
        'Store Code', 'Store code', 'StoreCode', 'Store', 'store_code', 
        'STORE CODE', 'Store code ', 'Store Code '
      ],
      materialCode: [
        'Material Code', 'Material code', 'Material', 'MaterialCode', 'material_code', 
        'SKU', 'MATERIAL', 'Material code ', 'Material Code ',
        'Material Name', 'Material name', 'MaterialName', 'material_name' // Added Material Name variants
      ],
      materialName: [
        'Material Description', 'Material Name', 'MaterialName', 'Description', 
        'material_name', 'Item Name', 'MATERIAL DESCRIPTION', 'Material Description ', 
        'Material description', 'MaterialDescription', 'material_description'
      ],
      systemQuantity: [
        'SYS', 'System Quantity', 'SystemQuantity', 'system_quantity', 
        'Quantity', 'QTY', 'SYSTEM QUANTITY', 'SYS ', 'Sys'
      ],
      sold: [
        'Sold', 'sold', 'SOLD', 'Physical Quantity', 'PhysicalQuantity', 
        'physical_quantity', 'Physical', 'Sold '
      ],
      difference: [
        'Diff', 'diff', 'DIFF', 'Difference', 'difference', 'DIFFERENCE', 'Diff '
      ],
      remarks: [
        'Remarks', 'remarks', 'REMARKS', 'Remark', 'remark', 'Notes', 'notes', 'Remarks '
      ],
      date: [
        'Date', 'DATE', 'Inventory Date', 'InventoryDate', 'inventory_date', 'Date '
      ],
    };

    const findColumn = (row, possibleNames) => {
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
          return row[name];
        }
      }
      return null;
    };

    // Create upload batch
    const batch = await prisma.uploadBatch.create({
      data: {
        originalFileName: file.originalname,
        uploadedBy: req.user.id,
        inventoryDate: new Date(inventoryDate),
        totalRows: rows.length,
        successfulRows: 0,
        rejectedRows: 0,
        status: 'PENDING',
      },
    });

    const errors = [];
    const successfulRecords = [];

    // Fetch all stores ONCE before processing rows (prevents connection timeout on first upload)
    const allStores = await prisma.store.findMany({
      select: {
        id: true,
        storeCode: true,
      },
    });
    const storeMap = new Map(allStores.map(s => [s.storeCode, s.id]));

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row and 0-index

      try {
        const storeCode = findColumn(row, columnMap.storeCode)?.toString().trim();
        const materialCode = findColumn(row, columnMap.materialCode)?.toString().trim();
        const materialDescription = findColumn(row, columnMap.materialName)?.toString().trim();
        const systemQuantity = findColumn(row, columnMap.systemQuantity);
        
        // Use Material Description as materialName, or fallback to materialCode if not found
        const materialName = materialDescription || materialCode;

        if (!storeCode) {
          errors.push({ row: rowNum, error: 'Missing Store Code' });
          continue;
        }
        if (!materialCode) {
          errors.push({ row: rowNum, error: 'Missing Material Name' });
          continue;
        }
        if (!materialName) {
          errors.push({ row: rowNum, error: 'Missing Material Description' });
          continue;
        }
        if (systemQuantity === null || systemQuantity === undefined) {
          errors.push({ row: rowNum, error: 'Missing SYS (System Quantity)' });
          continue;
        }

        const qty = parseFloat(systemQuantity);
        if (isNaN(qty) || qty < 0) {
          errors.push({ row: rowNum, error: 'Invalid System Quantity' });
          continue;
        }

        // Find store from pre-loaded map (much faster than individual queries)
        const storeId = storeMap.get(storeCode);
        if (!storeId) {
          errors.push({ row: rowNum, error: `Unknown store code: ${storeCode}` });
          continue;
        }

        successfulRecords.push({
          batchId: batch.id,
          storeId: storeId,
          materialCode,
          materialName,
          systemQuantity: qty,
          status: 'PENDING',
        });
      } catch (error) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    // Insert successful records
    if (successfulRecords.length > 0) {
      await prisma.inventoryRecord.createMany({
        data: successfulRecords,
      });
    }

    // Update batch
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        successfulRows: successfulRecords.length,
        rejectedRows: errors.length,
        status: errors.length === rows.length ? 'FAILED' : 'COMPLETED',
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPLOAD_INVENTORY',
      entityType: 'UPLOAD_BATCH',
      entityId: batch.id,
      metadata: {
        fileName: file.originalname,
        totalRows: rows.length,
        successfulRows: successfulRecords.length,
        rejectedRows: errors.length,
      },
    });

    res.status(201).json({
      batchId: batch.id,
      totalRows: rows.length,
      successfulRows: successfulRecords.length,
      rejectedRows: errors.length,
      errors: errors.slice(0, 50), // Limit error details
    });
  } catch (error) {
    next(error);
  }
}

export async function previewUpload(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('File is required', 400);
    }

    const { inventoryDate } = req.body;
    if (!inventoryDate) {
      throw new AppError('Inventory date is required', 400);
    }

    const file = req.file;
    let rows = [];

    // Parse file based on type
    if (file.mimetype.includes('csv')) {
      rows = parse(file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      // Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer);
      const worksheet = workbook.worksheets[0];

      const headers = [];
      worksheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value.toString().trim());
      });

      worksheet.eachRow((row, rowIndex) => {
        if (rowIndex === 1) return; // Skip header
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          rowData[headers[colNumber - 1]] = cell.value;
        });
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
    }

    if (rows.length === 0) {
      throw new AppError('No data rows found in file', 400);
    }

    console.log('📋 Preview - Excel Headers Found:', Object.keys(rows[0]));

    // Map column names
    const columnMap = {
      storeCode: [
        'Store Code', 'Store code', 'StoreCode', 'Store', 'store_code', 
        'STORE CODE', 'Store code ', 'Store Code '
      ],
      materialCode: [
        'Material Code', 'Material code', 'Material', 'MaterialCode', 'material_code', 
        'SKU', 'MATERIAL', 'Material code ', 'Material Code ',
        'Material Name', 'Material name', 'MaterialName', 'material_name'
      ],
      materialName: [
        'Material Description', 'Material Name', 'MaterialName', 'Description', 
        'material_name', 'Item Name', 'MATERIAL DESCRIPTION', 'Material Description ', 
        'Material description', 'MaterialDescription', 'material_description'
      ],
      systemQuantity: [
        'SYS', 'System Quantity', 'SystemQuantity', 'system_quantity', 
        'Quantity', 'QTY', 'SYSTEM QUANTITY', 'SYS ', 'Sys'
      ],
    };

    const findColumn = (row, possibleNames) => {
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
          return row[name];
        }
      }
      return null;
    };

    // Fetch all store codes for validation
    const stores = await prisma.store.findMany({
      select: { storeCode: true, storeName: true },
    });
    const storeMap = new Map(stores.map(s => [s.storeCode, s.storeName]));

    const preview = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    // Process each row for preview (limit to first 100 for performance)
    const previewLimit = Math.min(rows.length, 100);
    for (let i = 0; i < previewLimit; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row and 0-index

      const storeCode = findColumn(row, columnMap.storeCode)?.toString().trim();
      const materialCode = findColumn(row, columnMap.materialCode)?.toString().trim();
      const materialDescription = findColumn(row, columnMap.materialName)?.toString().trim();
      const systemQuantity = findColumn(row, columnMap.systemQuantity);
      
      const materialName = materialDescription || materialCode;

      let status = 'valid';
      let message = '';
      const errors = [];
      const warnings = [];

      // Validation
      if (!storeCode) {
        errors.push('Missing Store Code');
      } else if (!storeMap.has(storeCode)) {
        errors.push(`Unknown store code: ${storeCode}`);
      }

      if (!materialCode) {
        errors.push('Missing Material Name');
      }

      if (!materialName) {
        warnings.push('Missing Material Description - will use Material Code');
      }

      if (systemQuantity === null || systemQuantity === undefined || systemQuantity === '') {
        errors.push('Missing SYS (System Quantity)');
      } else {
        const qty = parseFloat(systemQuantity);
        if (isNaN(qty)) {
          errors.push('Invalid System Quantity (not a number)');
        } else if (qty < 0) {
          errors.push('Invalid System Quantity (negative)');
        }
      }

      if (errors.length > 0) {
        status = 'error';
        message = errors.join('; ');
        errorCount++;
      } else if (warnings.length > 0) {
        status = 'warning';
        message = warnings.join('; ');
        warningCount++;
      } else {
        status = 'valid';
        message = 'OK';
        validCount++;
      }

      preview.push({
        row: rowNum,
        storeCode: storeCode || '',
        storeName: storeCode ? storeMap.get(storeCode) || '' : '',
        materialCode: materialCode || '',
        materialName: materialName || '',
        systemQuantity: systemQuantity !== null ? systemQuantity : '',
        status,
        message,
      });
    }

    res.json({
      fileName: file.originalname,
      inventoryDate,
      totalRows: rows.length,
      previewRows: preview.length,
      statistics: {
        valid: validCount,
        errors: errorCount,
        warnings: warningCount,
      },
      preview,
      showingPartial: rows.length > 100,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUploads(req, res, next) {
  try {
    const uploads = await prisma.uploadBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploader: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    res.json(uploads);
  } catch (error) {
    next(error);
  }
}

export async function getUploadDetails(req, res, next) {
  try {
    const { id } = req.params;

    const upload = await prisma.uploadBatch.findUnique({
      where: { id: parseInt(id) },
      include: {
        uploader: {
          select: {
            employeeId: true,
            name: true,
          },
        },
        inventoryRecords: {
          take: 100,
          include: {
            store: {
              select: {
                storeCode: true,
                storeName: true,
              },
            },
          },
        },
      },
    });

    if (!upload) {
      throw new AppError('Upload not found', 404);
    }

    res.json(upload);
  } catch (error) {
    next(error);
  }
}

export async function getInventory(req, res, next) {
  const startTime = Date.now();
  try {
    const { storeId, status, search, batchId, page = 1, pageSize = 50 } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }
    if (batchId) {
      where.batchId = parseInt(batchId);
    }
    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    // Get total count for pagination
    const totalRecords = await prisma.inventoryRecord.count({ where });

    const records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSizeNum,
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_ADMIN_INVENTORY (${records.length} records, page ${pageNum}): ${duration}ms`);

    res.json({
      data: records,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSizeNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getReconciliationReport(req, res, next) {
  try {
    const { storeId, status, discrepancy } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }

    const records = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        submitter: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    // Filter by discrepancy type if specified
    let filtered = records;
    if (discrepancy === 'matched') {
      filtered = records.filter((r) => r.difference === 0);
    } else if (discrepancy === 'shortage') {
      filtered = records.filter((r) => r.difference < 0);
    } else if (discrepancy === 'excess') {
      filtered = records.filter((r) => r.difference > 0);
    }

    res.json(filtered);
  } catch (error) {
    next(error);
  }
}

export async function downloadReconciliationReport(req, res, next) {
  try {
    const { storeId, status, discrepancy } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }

    const records = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        submitter: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    // Filter by discrepancy type
    let filtered = records;
    if (discrepancy === 'matched') {
      filtered = records.filter((r) => r.difference === 0);
    } else if (discrepancy === 'shortage') {
      filtered = records.filter((r) => r.difference < 0);
    } else if (discrepancy === 'excess') {
      filtered = records.filter((r) => r.difference > 0);
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reconciliation Report');

    // Add headers
    worksheet.columns = [
      { header: 'Store Code', key: 'storeCode', width: 12 },
      { header: 'Store Name', key: 'storeName', width: 20 },
      { header: 'Inventory Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Code', key: 'materialCode', width: 15 },
      { header: 'Material Name', key: 'materialName', width: 30 },
      { header: 'System Quantity', key: 'systemQuantity', width: 18 },
      { header: 'Physical Quantity', key: 'physicalQuantity', width: 18 },
      { header: 'Difference', key: 'difference', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Submitted By', key: 'submittedBy', width: 20 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data
    filtered.forEach((record) => {
      worksheet.addRow({
        storeCode: record.store.storeCode,
        storeName: record.store.storeName,
        inventoryDate: record.batch.inventoryDate.toISOString().split('T')[0],
        materialCode: record.materialCode,
        materialName: record.materialName,
        systemQuantity: record.systemQuantity,
        physicalQuantity: record.physicalQuantity,
        difference: record.difference,
        remarks: record.remarks,
        status: record.status,
        submittedBy: record.submitter ? record.submitter.name : '',
        submittedAt: record.submittedAt ? record.submittedAt.toISOString() : '',
      });
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_REPORT',
      entityType: 'INVENTORY_RECORD',
      entityId: null,
      metadata: { recordCount: filtered.length, filters: { storeId, status, discrepancy } },
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=reconciliation_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

export async function downloadInventoryExport(req, res, next) {
  const startTime = Date.now();
  try {
    const { storeId, status, search, batchId, discrepancy } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }
    if (batchId) {
      where.batchId = parseInt(batchId);
    }
    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch all matching records (no pagination limit for export)
    let records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        submitter: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    // Apply discrepancy filter
    if (discrepancy === 'matched') {
      records = records.filter((r) => r.difference === 0);
    } else if (discrepancy === 'shortage') {
      records = records.filter((r) => r.difference !== null && r.difference < 0);
    } else if (discrepancy === 'excess') {
      records = records.filter((r) => r.difference !== null && r.difference > 0);
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory Records');

    // Define columns with business-friendly names
    worksheet.columns = [
      { header: 'Store Code', key: 'storeCode', width: 12 },
      { header: 'Store Name', key: 'storeName', width: 25 },
      { header: 'Inventory Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Code', key: 'materialCode', width: 15 },
      { header: 'Material Name', key: 'materialName', width: 35 },
      { header: 'SYS', key: 'sys', width: 12 },
      { header: 'Sold', key: 'sold', width: 12 },
      { header: 'Diff', key: 'diff', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Submitted By', key: 'submittedBy', width: 20 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Enable AutoFilter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 12 },
    };

    // Add data rows
    records.forEach((record) => {
      worksheet.addRow({
        storeCode: record.store.storeCode,
        storeName: record.store.storeName,
        inventoryDate: record.batch.inventoryDate.toISOString().split('T')[0],
        materialCode: record.materialCode,
        materialName: record.materialName,
        sys: record.systemQuantity,
        sold: record.physicalQuantity !== null ? record.physicalQuantity : '',
        diff: record.difference !== null ? record.difference : '',
        remarks: record.remarks || '',
        status: record.status,
        submittedBy: record.submitter ? `${record.submitter.name} (${record.submitter.employeeId})` : '',
        submittedAt: record.submittedAt ? record.submittedAt.toISOString().replace('T', ' ').substring(0, 19) : '',
      });
    });

    // Format Store Code and Material Code as text to preserve leading zeros
    const storeCodeCol = worksheet.getColumn('storeCode');
    storeCodeCol.numFmt = '@';
    const materialCodeCol = worksheet.getColumn('materialCode');
    materialCodeCol.numFmt = '@';

    await createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_ADMIN_INVENTORY_EXPORT',
      entityType: 'INVENTORY_RECORD',
      entityId: null,
      metadata: { recordCount: records.length, filters: { storeId, status, batchId, discrepancy } },
    });

    const duration = Date.now() - startTime;
    console.log(`[PERF] DOWNLOAD_ADMIN_EXPORT (${records.length} records): ${duration}ms`);

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const storeFilter = storeId ? `_Store_${storeId}` : '';
    const filename = `KinGuard${storeFilter}_Inventory_${date}.xlsx`;

    // Send file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogs(req, res, next) {
  try {
    const { action, limit = 100 } = req.query;

    const where = action ? { action } : {};

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        user: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
}
