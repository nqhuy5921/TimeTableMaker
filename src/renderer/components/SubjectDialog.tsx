import { useId, useState } from 'react';
import { addSubject } from '../../domain/lists';
import { COLOR_KEYS, type ColorKey, type Id, type TimetableFile } from '../../domain/model';
import {
  contrastRatio,
  formColorFields,
  PALETTE_SUBJECTS,
  READABLE_CONTRAST,
  subjectColorChoice,
  subjectColors,
  type SubjectColorChoice,
  type SubjectColors,
} from '../../domain/subjectColor';
import { editSubject } from '../../domain/subjects';
import { cleanName } from '../../domain/text';
import { NameDialog } from './NameDialog';
import { subjectColorProps } from './subjectColors';

interface SubjectDialogProps {
  file: TimetableFile;
  /** The subject to rename, or null to add one. */
  subjectId: Id | null;
  /** Commits the changed file and closes the form. */
  onDone: (file: TimetableFile) => void;
  onCancel: () => void;
}

/** A palette's tint and ink as '#rrggbb', read from its tokens, for Custom to start from.
    A canvas writes back any CSS color it's given as '#rrggbb', so the color inputs and the
    save get that form however a token is written (R3-5b review). */
function paletteHex(key: ColorKey): { bg: string; ink: string } {
  const style = getComputedStyle(document.documentElement);
  const context = document.createElement('canvas').getContext('2d');
  const hex = (part: 'bg' | 'ink') => {
    const token = style.getPropertyValue(`--subject-${key}-${part}`).trim();
    if (!context) return token;
    context.fillStyle = part === 'bg' ? '#ffffff' : '#000000';
    context.fillStyle = token;
    return context.fillStyle;
  };
  return { bg: hex('bg'), ink: hex('ink') };
}

/** One choice of the Colors row: a native radio, hidden, with its pill or swatch. */
function ColorOption({
  name,
  label,
  checked,
  onChoose,
  children,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChoose: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="color-option" title={label}>
      <input
        type="radio"
        className="visually-hidden"
        name={name}
        aria-label={label}
        checked={checked}
        onChange={onChoose}
      />
      {children}
    </label>
  );
}

/** The Colors row (SYSTEM_DESIGN §10.5): From the name, the 15 palettes as round swatches
    named by their subject, and Custom, which shows Background and Text. */
function ColorsField({
  choice,
  shown,
  onChange,
}: {
  choice: SubjectColorChoice;
  /** The colors on show, which Custom starts from. */
  shown: SubjectColors;
  onChange: (choice: SubjectColorChoice) => void;
}) {
  const id = useId();
  const custom = choice.source === 'custom' ? choice : null;
  return (
    <div className="field">
      <span id={`${id}-label`} className="field-label">
        Colors
      </span>
      <div className="color-options" role="radiogroup" aria-labelledby={`${id}-label`}>
        <ColorOption
          name={id}
          label="From the name"
          checked={choice.source === 'name'}
          onChoose={() => onChange({ source: 'name' })}
        >
          <span className="toggle-chip">From the name</span>
        </ColorOption>
        {COLOR_KEYS.map((key) => (
          <ColorOption
            key={key}
            name={id}
            label={`${PALETTE_SUBJECTS[key]}'s colors`}
            checked={choice.source === 'palette' && choice.key === key}
            onChoose={() => onChange({ source: 'palette', key })}
          >
            <span className={`color-swatch subject-${key}`} />
          </ColorOption>
        ))}
        <ColorOption
          name={id}
          label="Custom"
          checked={custom !== null}
          onChoose={() =>
            onChange({ source: 'custom', ...(shown.custom ?? paletteHex(shown.key)) })
          }
        >
          <span className="toggle-chip">Custom</span>
        </ColorOption>
      </div>
      {custom && (
        <div className="color-custom">
          {(['bg', 'ink'] as const).map((part) => (
            <label key={part} className="color-custom-field">
              <span>{part === 'bg' ? 'Background' : 'Text'}</span>
              <input
                type="color"
                aria-label={part === 'bg' ? 'Background' : 'Text'}
                value={custom[part]}
                onChange={(event) => onChange({ ...custom, [part]: event.target.value })}
              />
              <span className="tnum">{custom[part]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** The subject's tag and a card as it sits on the grid, in the colors chosen, updated as
    the name is typed and the colors change. Screen readers hear the tag and the note, not the
    card, which repeats the tag (R3-5b review). */
function SubjectPreview({ name, shown }: { name: string; shown: SubjectColors }) {
  const label = name === '' ? 'Subject' : name;
  const hardToRead =
    shown.custom !== null && contrastRatio(shown.custom.bg, shown.custom.ink) < READABLE_CONTRAST;
  return (
    <div className="condition-preview subject-preview" data-testid="subject-preview">
      <span className="caption">Preview</span>
      <div className="subject-preview-row">
        <span aria-live="polite">
          <span {...subjectColorProps(shown, 'subject-tag')} data-testid="subject-preview-tag">
            {label}
          </span>
        </span>
        <div className="subject-preview-slot" aria-hidden="true">
          <div
            {...subjectColorProps(shown, 'tt-card tt-card-full')}
            data-testid="subject-preview-card"
          >
            <div className="tt-card-face">
              <span className="tt-card-name">{label}</span>
              <span className="tt-card-meta">Teacher · Room</span>
            </div>
          </div>
        </div>
      </div>
      <div role="status">
        {hardToRead && (
          <p className="caption condition-preview-hint">
            This text may be hard to read on this background.
          </p>
        )}
      </div>
    </div>
  );
}

// The subject form (DM-4, layout spec "Room form and Subject form"): one Name field, unique
// among the subjects, the Colors row, and a preview of the subject's tag and a grid card in
// the colors chosen (SYSTEM_DESIGN §10.5). Mount it to open it and unmount it to close it.
export function SubjectDialog({ file, subjectId, onDone, onCancel }: SubjectDialogProps) {
  const editing = subjectId === null ? undefined : file.subjects.find((s) => s.id === subjectId);
  const [choice, setChoice] = useState<SubjectColorChoice>(
    editing ? subjectColorChoice(editing) : { source: 'name' },
  );
  /** The colors the form would give a subject called `name`. */
  const shownFor = (name: string): SubjectColors =>
    subjectColors(formColorFields(editing, name, choice) ?? undefined);
  return (
    <NameDialog
      title={editing ? `Edit ${editing.name}` : 'Add subject'}
      label="Name"
      submitLabel={editing ? 'Save' : 'Add subject'}
      initialName={editing?.name}
      wide
      onSubmit={(name) => {
        const result = editing
          ? editSubject(file, editing.id, name, choice)
          : addSubject(file, name, choice);
        if (!result.ok) return result.error;
        onDone(result.file);
        return null;
      }}
      onCancel={onCancel}
      preview={(name) => {
        const shown = shownFor(cleanName(name));
        return (
          <>
            <ColorsField choice={choice} shown={shown} onChange={setChoice} />
            <SubjectPreview name={cleanName(name)} shown={shown} />
          </>
        );
      }}
    />
  );
}
