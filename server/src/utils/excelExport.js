import ExcelJS from 'exceljs';

const HEADER_BG = 'FFE0E0E0';

// Prefix cells that could trigger formula execution in Excel.
export function sanitizeCell(value) {
  if (typeof value !== 'string') return value;
  if (value.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(value[0])) {
    return "'" + value;
  }
  return value;
}

/**
 * Build a standard inventory export workbook.
 * @param {object[]} records  - Array of InventoryRecord rows with .store and .batch includes.
 * @param {object}   options
 * @param {string}   options.sheetName   - Worksheet tab name.
 * @param {boolean}  options.includeDate - Whether to include the batch date column.
 * @param {boolean}  options.includeSubmitter - Whether to include submitted-by column.
 */
export function buildInventoryWorkbook(records, {
  sheetName = 'Inventory Records',
  includeDate = true,
  includeSubmitter = true,
} = {}) {
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const columns = [
    { header: 'Plant Code',           key: 'storeCode',    width: 12 },
    { header: 'Plant Name',           key: 'storeName',    width: 22 },
  ];
  if (includeDate) {
    columns.push({ header: 'Date',   key: 'inventoryDate', width: 15 });
  }
  columns.push(
    { header: 'Material Code',        key: 'materialCode', width: 20 },
    { header: 'Material Description', key: 'materialName', width: 32 },
    { header: 'System Stock',         key: 'sys',          width: 14 },
    { header: 'Physical Stock',       key: 'sold',         width: 14 },
    { header: 'Diff',                 key: 'diff',         width: 10 },
    { header: 'Category',             key: 'category',     width: 18 },
    { header: 'Remarks',              key: 'remarks',      width: 30 },
    { header: 'Status',               key: 'status',       width: 12 },
  );
  if (includeSubmitter) {
    columns.push({ header: 'Submitted By', key: 'submittedBy', width: 22 });
  }

  worksheet.columns = columns;

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: worksheet.columns.length },
  };

  records.forEach(r => {
    const row = {
      storeCode:    r.store.storeCode,
      storeName:    r.store.storeName,
      materialCode: r.materialCode,
      materialName: sanitizeCell(r.materialName),
      sys:          r.systemQuantity,
      sold:         r.physicalQuantity ?? '',
      diff:         r.difference ?? '',
      category:     r.shrinkageCategory || '',
      remarks:      sanitizeCell(r.remarks || ''),
      status:       r.status,
    };
    if (includeDate) {
      row.inventoryDate = r.batch?.inventoryDate
        ? r.batch.inventoryDate.toISOString().split('T')[0]
        : '';
    }
    if (includeSubmitter) {
      row.submittedBy = r.submitter
        ? `${r.submitter.name} (${r.submitter.employeeId})`
        : '';
    }
    worksheet.addRow(row);
  });

  // Format Plant Code and Material Code as text to preserve leading zeros
  worksheet.getColumn('storeCode').numFmt    = '@';
  worksheet.getColumn('materialCode').numFmt = '@';

  return workbook;
}
