import type { IssueKind } from '../../domain/checks';
import type { IssueFilters } from '../../domain/issues';
import type { Id } from '../../domain/model';

/** The Issues tab's scope and filters (TC-3), kept by the app so they stay through a tab
    switch, a class switch, and a visit to another screen, like the Subjects search. */
export interface IssuesView {
  /** The class on screen, or every class. With no class on screen it's every class. */
  scope: 'class' | 'all';
  severity: IssueFilters['severity'];
  teacherId: Id | null;
  kind: IssueKind | null;
}

export const DEFAULT_ISSUES_VIEW: IssuesView = {
  scope: 'class',
  severity: 'all',
  teacherId: null,
  kind: null,
};
