import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveScheduler } from '../../src/renderer/state/saveScheduler';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A save that finishes only when the test says so. */
function controlledSave() {
  const saved: string[] = [];
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        pending.push({
          resolve: () => {
            saved.push(value);
            resolve();
          },
          reject,
        });
      }),
  );
  return { save, saved, pending };
}

describe('createSaveScheduler (TB-7)', () => {
  it('saves only the newest value, half a second after the first change', async () => {
    const save = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve());
    const saver = createSaveScheduler(save);
    saver.schedule('a');
    await vi.advanceTimersByTimeAsync(300);
    saver.schedule('b');
    saver.schedule('c');
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(save.mock.calls).toEqual([['c']]);
  });

  it('saves at most once every half second while changes keep coming', async () => {
    const save = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve());
    const saver = createSaveScheduler(save);
    for (let i = 0; i < 20; i++) {
      saver.schedule(`v${i}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    // Two seconds of changes: saves at 0.5, 1, 1.5, and 2 seconds.
    expect(save.mock.calls).toEqual([['v4'], ['v9'], ['v14'], ['v19']]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(4);
  });

  it('never runs two saves at once', async () => {
    const { save, saved, pending } = controlledSave();
    const saver = createSaveScheduler(save);
    saver.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule('b');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);

    pending[0]!.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
    pending[1]!.resolve();
    await vi.runAllTimersAsync();
    expect(saved).toEqual(['a', 'b']);
  });

  it('flush saves the waiting value straight away and waits for it', async () => {
    const save = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve());
    const saver = createSaveScheduler(save);
    saver.schedule('a');
    await saver.flush();
    expect(save.mock.calls).toEqual([['a']]);

    // Nothing waiting: nothing to do, and the old timer doesn't fire a second save.
    await saver.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush waits for a running save, then saves the newer value', async () => {
    const { save, saved, pending } = controlledSave();
    const saver = createSaveScheduler(save);
    saver.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule('b');

    let flushed = false;
    void saver.flush().then(() => (flushed = true));
    pending[0]!.resolve();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(flushed).toBe(false);
    pending[1]!.resolve();
    await vi.waitFor(() => expect(flushed).toBe(true));
    expect(saved).toEqual(['a', 'b']);
  });

  it('reports a failed save and tries it again with the next change', async () => {
    const results: unknown[] = [];
    const save = vi.fn(async (value: string) => {
      if (value === 'a') throw new Error('disk full');
    });
    const saver = createSaveScheduler(save, { onResult: (error) => results.push(error) });
    saver.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    expect(results).toEqual([new Error('disk full')]);

    // Not retried on its own.
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule('b');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenLastCalledWith('b');
    expect(results).toEqual([new Error('disk full'), null]);
  });

  it('saves a change made while a save that then fails was running', async () => {
    const { save, pending } = controlledSave();
    const saver = createSaveScheduler(save, { onResult: () => {} });
    saver.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule('b');
    pending[0]!.reject(new Error('disk full'));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenLastCalledWith('b');
  });

  it('flush says whether everything is saved, so a failed save is never dropped', async () => {
    let fail = true;
    const save = vi.fn(async () => {
      if (fail) throw new Error('disk full');
    });
    const saver = createSaveScheduler(save, { onResult: () => {} });
    expect(await saver.flush()).toBe(true);
    saver.schedule('a');
    expect(await saver.flush()).toBe(false);
    fail = false;
    expect(await saver.flush()).toBe(true);
    expect(save.mock.calls).toEqual([['a'], ['a']]);
  });
});
