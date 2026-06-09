import type { RiskEdit } from '@/types';

/**
 * Maps a risk edit to the page where it is actually viewable/actionable for its
 * current pipeline stage. Single source of truth for "Open in workspace" links
 * and edit-row navigation across the app.
 *
 * Note the post-QA stages: the /workspace/* pages each filter to specific
 * stages (draft-queue → draft+ready_for_uat, uat → ready_for_uat+uat_in_progress,
 * qa → qa_review), so approved/sent_to_it/live/rejected edits are not viewable
 * in any workspace tab and are routed to the page that does show them.
 */
export function workspaceUrlForEdit(edit: RiskEdit): string {
  switch (edit.current_stage) {
    case 'draft':
      return `/workspace/draft-queue?edit=${edit.id}`;
    case 'ready_for_uat':
    case 'uat_in_progress':
      return '/workspace/uat';
    case 'qa_review':
      return `/workspace/qa?edit=${edit.id}`;
    case 'approved':
      return '/changelog';
    case 'sent_to_it':
    case 'live':
      return '/it-handoff-log';
    case 'rejected':
      return '/risk-edits';
    default:
      return '/workspace/draft-queue';
  }
}
