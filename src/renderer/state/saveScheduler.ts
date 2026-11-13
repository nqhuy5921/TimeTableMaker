// Sends the latest value to be saved at most once every `delayMs` (TB-7). A change
// starts the timer, and when it fires only the newest value goes out. Saves never
// overlap: a change made while one is running waits for it and then for the timer.

export interface SaveScheduler<T> {
  /** A new value to save. Replaces any value still waiting. */
  schedule(value: T): void;
  /** Saves the waiting value now. Resolves true once everything is saved, or false when a
      save failed (or a newer value came in meanwhile), so something is still unsaved. */
  flush(): Promise<boolean>;
}

export interface SaveSchedulerOptions {
  delayMs?: number;
  /** Called after each save: null when it worked, or the error. */
  onResult?: (error: unknown) => void;
}

export function createSaveScheduler<T>(
  save: (value: T) => Promise<void>,
  { delayMs = 500, onResult }: SaveSchedulerOptions = {},
): SaveScheduler<T> {
  let waiting: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  function startTimer() {
    if (timer === null && running === null && waiting !== null) {
      timer = setTimeout(() => void run(), delayMs);
    }
  }

  function run(): Promise<void> {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (running !== null) return running;
    if (waiting === null) return Promise.resolve();
    const { value } = waiting;
    waiting = null;
    const attempt = async (): Promise<boolean> => {
      try {
        await save(value);
        onResult?.(null);
        return true;
      } catch (error) {
        // Kept for the next try, unless a newer value has come in.
        waiting ??= { value };
        onResult?.(error);
        return false;
      }
    };
    // The callback always runs later, so `running` is set before it's cleared. A failed
    // value isn't retried on its own, but a newer one that came in meanwhile is saved.
    running = attempt().then((saved) => {
      running = null;
      if (saved || waiting?.value !== value) startTimer();
    });
    return running;
  }

  return {
    schedule(value) {
      waiting = { value };
      startTimer();
    },
    async flush() {
      // At most the save that's running and one more for the newest value, so a disk
      // that keeps failing can't hold this up. After a failure, the next change retries.
      if (running !== null) await running;
      if (waiting !== null) await run();
      return waiting === null && running === null;
    },
  };
}
