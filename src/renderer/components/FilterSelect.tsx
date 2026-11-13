import { ChevronDownIcon } from './Icons';

/** A dropdown in a pill like the search field, as on the Cards page and in the Issues tab. */
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="search-field filter-select">
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDownIcon size={14} />
    </label>
  );
}
