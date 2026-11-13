import type { CardGrouping } from '../../domain/cardPanel';

/** The Subjects tab's search and grouping (DM-7), kept by the app so they survive a visit
    to another screen (asked for on 2026-10-21). */
export interface PanelSearch {
  query: string;
  groupBy: CardGrouping;
}

export const EMPTY_PANEL_SEARCH: PanelSearch = { query: '', groupBy: 'subject' };
