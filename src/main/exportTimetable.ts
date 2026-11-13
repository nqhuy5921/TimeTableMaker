import { basename, dirname, extname, join } from 'node:path';
import { z } from 'zod';
import { EXAMPLE_FILE_NAME, exampleSchool } from '../domain/exampleSchool';
import {
  checkExportDetails,
  cleanExportDetails,
  defaultExportDetails,
  exportClassIds,
} from '../domain/exportDetails';
import { exportFileName, type ExportDetails, type ExportFormat } from '../domain/exportSheets';
import type { Id, TimetableFile } from '../domain/model';
import type { ExportResult } from '../shared/ipc';
import { exportDetailsSchema, timetableFileSchema } from '../shared/schema';
import { workbookBytes } from './exportExcel';
import { writeAtomic, writeFailureReason } from './store';

// Exporting (IE-2, SYSTEM_DESIGN §11.4): checks what the renderer sent, asks where to save
// with the system's save dialog (in the folder used last, with the suggested name), writes
// the file, and remembers the details for the profile. Nothing in the timetable changes.
// Download example (IE-1, §12.5) goes the same way, writing the made-up sample school.

export interface ExportDeps {
  /** The system save dialog: the chosen path, or null when cancelled. */
  askWhere: (defaultPath: string, format: ExportFormat) => Promise<string | null>;
  /** Where the first save dialog opens: the user's Documents folder. */
  documentsFolder: () => string;
  /** Saves the details in the open profile's settings. */
  saveDetails: (details: ExportDetails) => Promise<void>;
  /** Writes the file; `writeAtomic` unless a test stands in, so a write that fails part
      way leaves an earlier export at that path as it was. */
  write?: (path: string, bytes: Buffer) => Promise<void>;
}

export interface Exporter {
  run(request: unknown): Promise<ExportResult>;
  /** Asks where to save the example workbook and writes it. `retry` is as in a request. */
  saveExample(retry: unknown): Promise<ExportResult>;
  /** True for a file this run exported, the only ones Show in folder opens. */
  exported(path: string): boolean;
}

const requestSchema = z.object({
  file: z.unknown(),
  classIds: z.array(z.string().min(1)).min(1),
  scope: z.enum(['class', 'all']),
  format: z.enum(['xlsx', 'pdf']),
  details: exportDetailsSchema,
  retry: z.boolean().optional(),
});

const EXTENSIONS: Record<ExportFormat, string> = { xlsx: '.xlsx', pdf: '.pdf' };

/** The file's bytes, by format. PDF comes with R4-6. */
async function fileBytes(
  format: ExportFormat,
  file: TimetableFile,
  classIds: readonly Id[],
  details: ExportDetails,
): Promise<Buffer> {
  if (format === 'pdf') throw new Error("PDF export isn't ready yet.");
  return workbookBytes(file, classIds, details);
}

/** One file to ask where to save and write. */
interface SaveJob {
  suggested: string;
  format: ExportFormat;
  retry: boolean;
  bytes: () => Promise<Buffer>;
  /** Runs once the file is written. */
  afterSaving?: () => Promise<void>;
}

export function createExporter(deps: ExportDeps): Exporter {
  const write = deps.write ?? writeAtomic;
  // The folder used last, and where a failed export was going, for Try again.
  let lastFolder: string | null = null;
  let failedPath: string | null = null;
  const exportedPaths = new Set<string>();

  async function save(job: SaveJob): Promise<ExportResult> {
    let path = job.retry ? failedPath : null;
    if (path === null) {
      const chosen = await deps.askWhere(
        join(lastFolder ?? deps.documentsFolder(), job.suggested),
        job.format,
      );
      if (chosen === null) return { status: 'cancelled' };
      // A name typed without its extension still gets one, so the file opens in Excel.
      const extension = EXTENSIONS[job.format];
      path = extname(chosen).toLowerCase() === extension ? chosen : `${chosen}${extension}`;
    }

    const fileName = basename(path);
    const folder = dirname(path);
    try {
      await write(path, await job.bytes());
    } catch (error) {
      failedPath = path;
      return { status: 'failed', fileName, reason: exportFailureReason(error, fileName, folder) };
    }
    failedPath = null;
    lastFolder = folder;
    exportedPaths.add(path);
    await job.afterSaving?.();
    return { status: 'saved', path, fileName, folder };
  }

  async function run(raw: unknown): Promise<ExportResult> {
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) throw new Error("The export request isn't valid.");
    const request = parsed.data;
    const checkedFile = timetableFileSchema.safeParse(request.file);
    if (!checkedFile.success) throw new Error("The timetable doesn't match the file format.");
    const file = checkedFile.data;
    const classes = request.classIds.map((id) => file.classes.find((c) => c.id === id));
    if (classes.some((c) => c === undefined)) throw new Error('A class to export is missing.');
    const details = cleanExportDetails(request.details);
    const problems = Object.values(checkExportDetails(details));
    if (problems.length > 0) throw new Error(problems.join(' '));

    return save({
      suggested: exportFileName(request.scope, classes[0]?.name ?? '', request.format),
      format: request.format,
      retry: request.retry === true,
      bytes: () => fileBytes(request.format, file, request.classIds, details),
      // Only the dialog's next starting values are lost if this fails.
      afterSaving: () => deps.saveDetails(details).catch(() => undefined),
    });
  }

  /** The profile's own export details aren't touched by the example's. */
  function saveExample(retry: unknown): Promise<ExportResult> {
    const details = defaultExportDetails(new Date());
    const classIds = exportClassIds(exampleSchool, 'all', null);
    return save({
      suggested: EXAMPLE_FILE_NAME,
      format: 'xlsx',
      retry: retry === true,
      bytes: () => workbookBytes(exampleSchool, classIds, details),
    });
  }

  return { run, saveExample, exported: (path) => exportedPaths.has(path) };
}

/** Why an export wasn't written, in words the user can act on (the export notice). */
export function exportFailureReason(error: unknown, fileName: string, folder: string): string {
  return writeFailureReason(error, fileName, folder, 'export');
}
