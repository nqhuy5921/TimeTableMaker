import { useEffect, useState } from 'react';
import { SCREENS, type ScreenId } from '../screens/screens';
import { ChevronDownIcon } from './Icons';

interface TopBarProps {
  active: ScreenId;
  /** The open profile's name, on the pill that opens the profile screen (PF-2). */
  profileName: string;
  onNavigate: (screen: ScreenId) => void;
}

export function TopBar({ active, profileName, onNavigate }: TopBarProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.api.getAppInfo().then((info) => setVersion(info.version));
  }, []);

  return (
    <header className="topbar">
      {/* A fixed width, so the menu links don't move with the profile's name. */}
      <div className="topbar-start">
        <div className="topbar-brand">
          <span className="topbar-mark" aria-hidden="true" />
          TimeTableMaker
        </div>
        <button
          type="button"
          className="topbar-profile"
          aria-label={`Profile: ${profileName}`}
          aria-current={active === 'profiles' ? 'page' : undefined}
          title={profileName}
          data-testid="profile-pill"
          onClick={() => onNavigate('profiles')}
        >
          <span className="topbar-profile-name">{profileName}</span>
          <ChevronDownIcon size={14} />
        </button>
      </div>
      <nav aria-label="Main">
        <ul className="topbar-links">
          {SCREENS.map((screen) => (
            <li key={screen.id}>
              <button
                type="button"
                className="topbar-link"
                aria-current={screen.id === active ? 'page' : undefined}
                onClick={() => onNavigate(screen.id)}
              >
                <span className="topbar-link-label" data-label={screen.label}>
                  {screen.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {version && <div className="topbar-version tnum">Version {version}</div>}
    </header>
  );
}
