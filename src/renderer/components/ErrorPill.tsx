/** A teacher's or class's current errors as a small pink pill, or nothing at 0 (layout spec
    "Teachers page" and "List pages for classes, rooms, and subjects"). */
export function ErrorPill({ count }: { count: number }) {
  return count > 0 ? <span className="error-pill">{count}</span> : null;
}
