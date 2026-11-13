import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { WorkbookData, WorkbookSheet } from '../domain/importWorkbook';
import type { ImportFileResult } from '../shared/ipc';

// Reading a workbook to import (IE-1, SYSTEM_DESIGN §12.1): ExcelJS turns the .xlsx into
// plain `WorkbookData`, each cell as its text as Excel shows it, so every rule after this is
// in the domain. The file is only read, never written.

export interface ImportReaderDeps {
  /** The system open dialog: the chosen path, or null when cancelled. */
  askWhich: () => Promise<string | null>;
  /** Reads the file's bytes; `readFile` unless a test stands in. */
  read?: (path: string) => Promise<Buffer>;
}

/** Asks for a workbook and reads it. */
export function createImportReader(deps: ImportReaderDeps): () => Promise<ImportFileResult> {
  const read = deps.read ?? ((path: string) => readFile(path));
  return async () => {
    const path = await deps.askWhich();
    if (path === null) return { status: 'cancelled' };
    const fileName = basename(path);
    if (extname(path).toLowerCase() !== '.xlsx') {
      return { status: 'failed', fileName, reason: notWorkbook(fileName) };
    }
    let bytes: Buffer;
    try {
      bytes = await read(path);
    } catch (error) {
      return { status: 'failed', fileName, reason: readFailureReason(error, fileName) };
    }
    try {
      return { status: 'read', workbook: await readWorkbook(bytes, fileName) };
    } catch (error) {
      return { status: 'failed', fileName, reason: readFailureReason(error, fileName) };
    }
  };
}

const notWorkbook = (fileName: string) =>
  `${fileName} isn't an .xlsx workbook. Save it as .xlsx in Excel and choose it again.`;

/** Why a file couldn't be opened, in words the user can act on. */
export function readFailureReason(error: unknown, fileName: string): string {
  switch ((error as NodeJS.ErrnoException | null)?.code) {
    case 'EBUSY':
      return `${fileName} is open in another program. Close it and try again.`;
    case 'EACCES':
    case 'EPERM':
      return `${fileName} couldn't be opened. You may not have permission to read it.`;
    case 'ENOENT':
      return `${fileName} is missing. It may have been moved or deleted.`;
    default:
      return `${fileName} couldn't be read. It may be damaged, or not an Excel workbook.`;
  }
}

/** The workbook's sheets in order, each cell as text. */
export async function readWorkbook(bytes: Buffer, fileName: string): Promise<WorkbookData> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS takes the bytes as an ArrayBuffer of their own.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await workbook.xlsx.load(buffer as ArrayBuffer);
  return { fileName, sheets: workbook.worksheets.map(readSheet) };
}

/** Only rows and cells with a value are visited (a merged range's cells count), so a sheet
    whose rows or columns are formatted far past its data reads as quickly as its data. */
function readSheet(ws: ExcelJS.Worksheet): WorkbookSheet {
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      // Every cell of a merged range reads as the range's own, as a day name merged down
      // its rows must.
      const text = cellText(cell.isMerged ? cell.master.value : cell.value);
      if (text === '') return;
      while (cells.length < columnNumber - 1) cells.push('');
      cells[columnNumber - 1] = text;
    });
    if (cells.length === 0) return;
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  });
  return { name: ws.name, hidden: ws.state !== 'visible', rows };
}

/** A cell's text as Excel shows it: a formula's saved result, a number without grouping,
    a date as dd/mm/yyyy (a time alone as h:mm), rich text joined, an error as empty.
    Non-breaking spaces are spaces, and the text is trimmed. */
export function cellText(value: ExcelJS.CellValue): string {
  return clean(rawText(value));
}

function rawText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return dateText(value);
  if ('error' in value) return '';
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    return rawText((value as { result?: ExcelJS.CellValue }).result ?? null);
  }
  if ('text' in value) return typeof value.text === 'string' ? value.text : rawText(value.text);
  return '';
}

/** Whole numbers as they are (`912345678`), others with no more than 10 decimals, never
    in exponent form for the sizes a timetable holds. */
function numberText(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(10)));
}

/** ExcelJS reads dates as UTC. A time alone sits on Excel's day 0, 30 Dec 1899. */
function dateText(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  if (date.getUTCFullYear() <= 1899) {
    return `${date.getUTCHours()}:${two(date.getUTCMinutes())}`;
  }
  return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function clean(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .trim();
}
