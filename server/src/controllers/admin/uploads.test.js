// A .csv uploaded from a Windows machine with Excel installed arrives labelled
// application/vnd.ms-excel, and some browsers send application/octet-stream or nothing at
// all. The upload filter accepts those files on extension, so the parser has to as well —
// otherwise a genuine CSV reaches the xlsx reader and fails with an unhelpful 500.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseFileToRows, cellText } from './uploads.js';

const CSV = 'Plant,Material,System Stock\nSMOKE01,MAT-001,10\nSMOKE01,MAT-002,\n';

function file(mimetype, originalname = 'stock.csv', buffer = Buffer.from(CSV)) {
  return { mimetype, originalname, buffer };
}

async function xlsxBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Plant', 'Material', 'System Stock']);
  ws.addRow(['SMOKE01', 'MAT-001', 10]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseFileToRows', () => {
  it('parses a CSV sent as text/csv', async () => {
    const rows = await parseFileToRows(file('text/csv'));
    expect(rows).toHaveLength(2);
    expect(rows[0].Plant).toBe('SMOKE01');
    expect(rows[0]['System Stock']).toBe('10');
    expect(rows[1]['System Stock']).toBe('');
  });

  it.each(['application/vnd.ms-excel', 'application/octet-stream', ''])(
    'parses a .csv mislabelled as "%s"',
    async (mimetype) => {
      const rows = await parseFileToRows(file(mimetype));
      expect(rows).toHaveLength(2);
      expect(rows[0].Material).toBe('MAT-001');
    }
  );

  it('still parses a real workbook', async () => {
    const rows = await parseFileToRows({
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'stock.xlsx',
      buffer: await xlsxBuffer(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].Plant).toBe('SMOKE01');
    expect(rows[0]['System Stock']).toBe(10);
  });

  it('rejects an unreadable workbook with a 400, not a 500', async () => {
    const bad = {
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'stock.xlsx',
      buffer: Buffer.from('this is not a workbook'),
    };
    await expect(parseFileToRows(bad)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/could not be read as a spreadsheet/),
    });
  });
});

describe('cellText', () => {
  it('returns an empty string for null and undefined', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });

  it('trims a padded string', () => {
    expect(cellText('  MAT-001  ')).toBe('MAT-001');
  });

  it('stringifies numbers and booleans', () => {
    expect(cellText(10)).toBe('10');
    expect(cellText(0)).toBe('0');
    expect(cellText(false)).toBe('false');
  });

  it('flattens rich text', () => {
    expect(cellText({ richText: [{ text: 'MAT-' }, { text: '001' }] })).toBe('MAT-001');
  });

  it('reads the text of a hyperlink cell', () => {
    expect(cellText({ text: ' SMOKE01 ', hyperlink: 'http://example.com' })).toBe('SMOKE01');
  });
});
