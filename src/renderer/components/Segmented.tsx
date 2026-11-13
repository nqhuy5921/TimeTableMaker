// A row of pill options where exactly one is chosen, such as Group by: Subject / Teacher.

interface SegmentedProps<T extends string> {
  label: string;
  /** Each option's value and words, and why it can't be chosen for now, as its tooltip. */
  options: readonly (readonly [value: T, label: string, disabledReason?: string])[];
  value: T;
  onChange: (value: T) => void;
  /** Extra class for a variant, such as `segmented-dark`. */
  className?: string;
  /** Shown but not choosable, such as the Issues tab's scope with no class on screen. */
  disabled?: boolean;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  disabled = false,
}: SegmentedProps<T>) {
  // A radio group: Tab reaches only the chosen option, and the arrow keys, Home, and End
  // choose another and move focus to it, passing over any that can't be chosen.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const choosable = options.filter(([, , reason]) => reason === undefined);
    const index = choosable.findIndex(([option]) => option === value);
    const last = choosable.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index <= 0 ? last : index - 1,
      ArrowUp: index <= 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    const target = next === undefined ? undefined : choosable[next];
    if (!target) return;
    event.preventDefault();
    onChange(target[0]);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[options.indexOf(target)]?.focus();
  }

  return (
    <div
      className={className ? `segmented ${className}` : 'segmented'}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
    >
      {options.map(([option, text, reason]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          tabIndex={option === value ? 0 : -1}
          disabled={disabled || reason !== undefined}
          title={reason}
          className="segmented-option"
          onClick={() => onChange(option)}
        >
          <span className="segmented-label" data-label={text}>
            {text}
          </span>
        </button>
      ))}
    </div>
  );
}
