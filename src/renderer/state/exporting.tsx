import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { EXAMPLE_FILE_NAME } from '../../domain/exampleSchool';
import { defaultExportDetails } from '../../domain/exportDetails';
import { exportFileName, type ExportDetails } from '../../domain/exportSheets';
import type { WorkbookData } from '../../domain/importWorkbook';
import type { ExportRequest } from '../../shared/ipc';
import { ipcErrorMessage } from '../ipcError';

// Exporting (IE-2, IE-4, SYSTEM_DESIGN §11.4): the details the Export dialog starts with
// (the profile's last export, or the defaults), and the notice an export leaves, kept here
// so it stays up whichever screen opens next. The app remounts this for each profile.
// Choosing a workbook to import (IE-1) leaves its failure in the same notice, and an import
// says what came in there too.

export type ExportNoticeState =
  | { kind: 'saved'; fileName: string; folder: string; path: string; count: number }
  | {
      kind: 'failed';
      fileName: string;
      reason: string;
      /** What Try again sends; null for the example workbook. */
      request: ExportRequest | null;
      count: number;
    }
  | { kind: 'unread'; fileName: string; reason: string; count: number }
  /** An import is in (layout spec, Import notice). */
  | { kind: 'imported'; text: string; count: number }
  /** An import that didn't go ahead after its screen was left, so it can't say so itself. */
  | { kind: 'notImported'; reason: string; count: number };

interface Exporting {
  /** What the Export dialog starts with. */
  details: ExportDetails;
  notice: ExportNoticeState | null;
  /** Asks where to save, then writes the file and shows how it went. Resolves to false
      when the save dialog was cancelled, so the Export dialog stays open. */
  run: (request: ExportRequest) => Promise<boolean>;
  /** Asks where to save the example workbook, then writes it and shows how it went. */
  runExample: (retry?: boolean) => Promise<void>;
  /** Asks for a workbook and reads it: null when cancelled, when it couldn't be read, which
      the notice says, or while another is still being chosen. */
  chooseWorkbook: () => Promise<WorkbookData | null>;
  /** True from asking for a workbook until it's read. */
  choosing: boolean;
  /** Says what an import brought in. */
  showImported: (text: string) => void;
  /** Says why an import didn't go ahead, once its screen has gone. */
  showNotImported: (reason: string) => void;
  hideNotice: () => void;
}

const ExportingContext = createContext<Exporting | null>(null);

export function ExportingProvider({
  initial,
  imported,
  children,
}: {
  /** The profile's saved details, if it has exported before. */
  initial: ExportDetails | undefined;
  /** What the import notice says, when an import into a new profile has just opened it. */
  imported?: string | undefined;
  children: React.ReactNode;
}) {
  const [details, setDetails] = useState(() => initial ?? defaultExportDetails(new Date()));
  const [notice, setNotice] = useState<ExportNoticeState | null>(() =>
    imported === undefined ? null : { kind: 'imported', text: imported, count: Date.now() },
  );
  const [choosing, setChoosing] = useState(false);
  // The buttons that choose a workbook stay enabled while it's read, so they keep focus;
  // a second click meanwhile is ignored here.
  const choosingNow = useRef(false);

  const run = useCallback(async (request: ExportRequest) => {
    // Each notice is counted, so one after another is announced and timed afresh.
    const count = Date.now();
    try {
      const result = await window.api.exportTimetable(request);
      if (result.status === 'cancelled') return false;
      // The details were good, so the dialog starts from them next time, even when the file
      // wasn't written (the main process keeps them for the profile once it is).
      setDetails(request.details);
      if (result.status === 'saved') {
        setNotice({ kind: 'saved', ...result, count });
      } else {
        setNotice({ kind: 'failed', ...result, request, count });
      }
    } catch (error) {
      const className = request.file.classes.find((c) => c.id === request.classIds[0])?.name;
      setNotice({
        kind: 'failed',
        fileName: exportFileName(request.scope, className ?? '', request.format),
        reason: ipcErrorMessage(error),
        request,
        count,
      });
    }
    return true;
  }, []);

  const runExample = useCallback(async (retry = false) => {
    const count = Date.now();
    try {
      const result = await window.api.saveExample(retry);
      if (result.status === 'saved') setNotice({ kind: 'saved', ...result, count });
      if (result.status === 'failed') {
        setNotice({ kind: 'failed', ...result, request: null, count });
      }
    } catch (error) {
      setNotice({
        kind: 'failed',
        fileName: EXAMPLE_FILE_NAME,
        reason: ipcErrorMessage(error),
        request: null,
        count,
      });
    }
  }, []);

  const chooseWorkbook = useCallback(async () => {
    if (choosingNow.current) return null;
    choosingNow.current = true;
    setChoosing(true);
    try {
      const result = await window.api.chooseImportFile();
      if (result.status === 'read') {
        // An earlier file's failure no longer applies.
        setNotice((shown) => (shown?.kind === 'unread' ? null : shown));
        return result.workbook;
      }
      if (result.status === 'failed') {
        setNotice({ kind: 'unread', ...result, count: Date.now() });
      }
    } catch (error) {
      setNotice({
        kind: 'unread',
        fileName: 'The workbook',
        reason: ipcErrorMessage(error),
        count: Date.now(),
      });
    } finally {
      choosingNow.current = false;
      setChoosing(false);
    }
    return null;
  }, []);

  const showImported = useCallback(
    (text: string) => setNotice({ kind: 'imported', text, count: Date.now() }),
    [],
  );
  const showNotImported = useCallback(
    (reason: string) => setNotice({ kind: 'notImported', reason, count: Date.now() }),
    [],
  );
  const hideNotice = useCallback(() => setNotice(null), []);
  const value = useMemo(
    () => ({
      details,
      notice,
      run,
      runExample,
      chooseWorkbook,
      choosing,
      showImported,
      showNotImported,
      hideNotice,
    }),
    [
      details,
      notice,
      run,
      runExample,
      chooseWorkbook,
      choosing,
      showImported,
      showNotImported,
      hideNotice,
    ],
  );
  return <ExportingContext value={value}>{children}</ExportingContext>;
}

export function useExporting(): Exporting {
  const exporting = useContext(ExportingContext);
  if (!exporting) throw new Error('useExporting must be used inside ExportingProvider');
  return exporting;
}
