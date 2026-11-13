import { ChevronDownIcon } from './Icons';

/** A form dropdown (the card, teacher, and condition forms): the text input's box with the
    app's chevron 12px in from the right edge, in place of the system's arrow, which sat too
    close to it (asked for on 2026-10-26). Takes every prop a `<select>` does. */
export function SelectInput({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className="select-input">
      <select className={className ? `text-input ${className}` : 'text-input'} {...props} />
      <ChevronDownIcon size={14} />
    </span>
  );
}
