import { useEffect, useId, useRef, useState } from 'react';
import type { ExportFormat, ExportScope } from '../../domain/exportSheets';
import { ChevronDownIcon, DownloadIcon } from './Icons';

interface ExportMenuProps {
  /** The class on screen, or null with none, when the This class items are disabled. */
  className: string | null;
  /** All the classes; with none, every item is disabled. */
  classCount: number;
  onPick: (scope: ExportScope, format: ExportFormat) => void;
}

interface Item {
  scope: ExportScope;
  format: ExportFormat;
  label: string;
}

const ITEMS: Record<ExportScope, Item[]> = {
  class: [
    { scope: 'class', format: 'xlsx', label: 'This class as Excel' },
    { scope: 'class', format: 'pdf', label: 'This class as PDF' },
  ],
  all: [
    { scope: 'all', format: 'xlsx', label: 'All classes as Excel' },
    { scope: 'all', format: 'pdf', label: 'All classes as PDF' },
  ],
};

/** The PDF export (R4-6) is set aside for now (2026-10-29), so its items wait until it's built. */
const READY: Record<ExportFormat, boolean> = { xlsx: true, pdf: false };

// The class bar's Export button and its menu (IE-2, IE-4; layout spec, Class bar): This
// class and All classes, each as Excel or PDF, under muted headings. Each item opens the
// Export dialog. The menu closes on a pick, Escape, or a click outside it; the arrow keys
// move between its items.
export function ExportMenu({ className, classCount, onPick }: ExportMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const enabled = (item: Item) =>
    READY[item.format] && classCount > 0 && (item.scope === 'all' || className !== null);

  const menuItems = () =>
    [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].filter(
      (button) => !button.disabled,
    );

  useEffect(() => {
    if (!open) return;
    // The first item takes the focus, or the menu itself when every item is disabled, so
    // Escape and the arrow keys still reach it.
    (menuItems()[0] ?? menuRef.current)?.focus();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close();
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    const items = menuItems();
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (at + (step ?? 0) + items.length) % items.length;
    items[next]?.focus();
  }

  const group = (scope: ExportScope, heading: string) => (
    <div role="group" aria-labelledby={`${id}-${scope}`}>
      <p id={`${id}-${scope}`} className="export-menu-heading">
        {heading}
      </p>
      {ITEMS[scope].map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="export-menu-item"
          disabled={!enabled(item)}
          title={READY[item.format] ? undefined : "PDF export isn't ready yet"}
          onClick={() => {
            setOpen(false);
            onPick(item.scope, item.format);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="export-menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-export"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <DownloadIcon />
        Export
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          className="export-menu"
          role="menu"
          aria-label="Export"
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          {group('class', className === null ? 'This class' : `This class · ${className}`)}
          <hr className="export-menu-rule" />
          {group('all', `All classes · ${classCount}`)}
        </div>
      )}
    </div>
  );
}
