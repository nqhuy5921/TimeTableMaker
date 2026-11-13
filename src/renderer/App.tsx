import { useState } from 'react';
import type { WorkbookData } from '../domain/importWorkbook';
import { ExportNotice } from './components/ExportNotice';
import { SaveNotice } from './components/SaveNotice';
import { TopBar } from './components/TopBar';
import { CardsScreen } from './screens/CardsScreen';
import { ClassesScreen } from './screens/ClassesScreen';
import { ImportScreen } from './screens/ImportScreen';
import { ProfilesScreen } from './screens/ProfilesScreen';
import { RoomsScreen } from './screens/RoomsScreen';
import type { ScreenId } from './screens/screens';
import { SubjectsScreen } from './screens/SubjectsScreen';
import { TeachersScreen } from './screens/TeachersScreen';
import { TimetableScreen } from './screens/TimetableScreen';
import { DEFAULT_ISSUES_VIEW } from './state/issuesView';
import { EMPTY_PANEL_SEARCH } from './state/panelSearch';
import { useProfiles } from './state/profiles';

export function App() {
  const { openName } = useProfiles();
  const [screenId, setScreenId] = useState<ScreenId>('timetable');
  // The class bar's Add grades asks the Classes page to open its Grades dialog (DM-8), a
  // one-time request the page clears once it has.
  const [openGrades, setOpenGrades] = useState(false);
  // The Subjects panel's search and grouping, kept while another screen is open.
  const [panelSearch, setPanelSearch] = useState(EMPTY_PANEL_SEARCH);
  // The Issues tab's scope and filters, kept the same way.
  const [issuesView, setIssuesView] = useState(DEFAULT_ISSUES_VIEW);
  // The workbook being imported, kept only while the Import screen is open (§12.1). Each
  // file is counted, so another one starts the screen's choices again.
  const [importing, setImporting] = useState<{ workbook: WorkbookData; count: number } | null>(
    null,
  );
  // Back from the Import screen, focus goes to the profile screen's Import.
  const [backFromImport, setBackFromImport] = useState(false);

  function navigate(screen: ScreenId) {
    setImporting(null);
    setBackFromImport(false);
    setScreenId(screen);
  }

  function openImport(workbook: WorkbookData) {
    setImporting({ workbook, count: Date.now() });
    setBackFromImport(false);
  }

  return (
    <div className="shell">
      <TopBar
        active={importing ? 'import' : screenId}
        profileName={openName}
        onNavigate={navigate}
      />
      <main className="shell-main">
        {/* The notices drop under the header, the save notice first, one under the other
            when both are up. */}
        <div className="notice-stack">
          <SaveNotice />
          <ExportNotice />
        </div>
        {importing ? (
          <ImportScreen
            key={importing.count}
            workbook={importing.workbook}
            onChooseAnother={openImport}
            onBack={() => {
              setImporting(null);
              setBackFromImport(true);
            }}
            onImported={() => navigate('timetable')}
          />
        ) : screenId === 'cards' ? (
          <CardsScreen />
        ) : screenId === 'teachers' ? (
          <TeachersScreen />
        ) : screenId === 'classes' ? (
          <ClassesScreen openGrades={openGrades} onGradesOpened={() => setOpenGrades(false)} />
        ) : screenId === 'rooms' ? (
          <RoomsScreen />
        ) : screenId === 'subjects' ? (
          <SubjectsScreen />
        ) : screenId === 'profiles' ? (
          <ProfilesScreen onImport={openImport} focusImport={backFromImport} />
        ) : (
          <TimetableScreen
            search={panelSearch}
            onSearchChange={setPanelSearch}
            issuesView={issuesView}
            onIssuesViewChange={setIssuesView}
            onAddGrades={() => {
              setOpenGrades(true);
              setScreenId('classes');
            }}
          />
        )}
      </main>
    </div>
  );
}
