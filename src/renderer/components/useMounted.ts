import { useEffect, useRef } from 'react';

/** True while the component is on screen, so an answer that comes back after it has gone,
    such as a workbook read slowly, is dropped rather than acted on. */
export function useMounted(): { readonly current: boolean } {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
