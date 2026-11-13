import { useEffect, useRef } from 'react';

/** For a dialog that's open while it's mounted: opens it as a modal on mount and closes it
    on unmount. Spread the result on the `<dialog>`. Escape and any other close call
    `onCancel`, so the page unmounts the dialog rather than the browser closing it behind
    React's back. */
export function useModalDialog(onCancel: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return {
    ref,
    onCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
      // Escape: let React unmount the dialog rather than closing it behind its back.
      event.preventDefault();
      onCancel();
    },
    onClose() {
      // Chromium can close a dialog without a cancelable `cancel` event. Still open means
      // StrictMode reopened it after a remount, so there's nothing to do.
      if (!ref.current?.open) onCancel();
    },
  };
}
