import type { TimetableApi } from '../shared/ipc';

declare global {
  interface Window {
    api: TimetableApi;
  }
}
