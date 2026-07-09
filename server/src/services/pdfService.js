import PdfPrinter from 'pdfmake';

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

export function buildPDF(docDefinition) {
  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const RED = '#dc2626';

export function baseDocDef({ title, subtitle }) {
  return {
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: '#1e293b' },
    pageOrientation: 'landscape',
    pageMargins: [32, 72, 32, 44],
    header: () => ({
      columns: [
        {
          stack: [
            { text: 'KinMarché', fontSize: 15, bold: true, color: RED },
            { text: 'Loss & Prevention Platform', fontSize: 8, color: '#94a3b8', margin: [0, 2, 0, 0] },
          ],
          margin: [32, 14, 0, 0],
        },
        {
          stack: [
            { text: title, fontSize: 13, bold: true, color: '#1e293b' },
            subtitle ? { text: subtitle, fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0] } : {},
          ],
          alignment: 'right',
          margin: [0, 14, 32, 0],
        },
      ],
    }),
    footer: (page, pageCount) => ({
      text: `Page ${page} of ${pageCount}  ·  ${new Date().toLocaleString('en-GB')}  ·  KinMarché L&P`,
      alignment: 'center',
      fontSize: 7,
      color: '#94a3b8',
      margin: [32, 8],
    }),
    styles: {
      th: { bold: true, fontSize: 9, color: '#ffffff', fillColor: RED },
    },
  };
}

export function tableLayout() {
  return {
    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0 : 0.5),
    vLineWidth: () => 0,
    hLineColor: () => '#e2e8f0',
    fillColor: (row) => (row > 0 && row % 2 === 0 ? '#f8fafc' : null),
  };
}

function diffCell(diff) {
  if (diff === null || diff === undefined) return { text: '—', color: '#94a3b8' };
  const txt = diff > 0 ? `+${diff}` : String(diff);
  return { text: txt, color: diff < 0 ? RED : diff > 0 ? '#059669' : '#64748b', bold: diff !== 0 };
}

export function inventoryTableRows(records) {
  return records.map(r => [
    { text: r.store?.storeCode || '', bold: true, color: RED },
    r.materialCode || '',
    { text: r.materialName || '', color: '#64748b' },
    r.batch ? r.batch.inventoryDate.toISOString().split('T')[0] : '',
    { text: String(r.systemQuantity), alignment: 'right' },
    { text: r.physicalQuantity !== null ? String(r.physicalQuantity) : '—', alignment: 'right' },
    { ...diffCell(r.difference), alignment: 'right' },
    { text: r.status === 'SUBMITTED' ? 'Counted' : 'Pending', color: r.status === 'SUBMITTED' ? '#059669' : '#d97706' },
  ]);
}
