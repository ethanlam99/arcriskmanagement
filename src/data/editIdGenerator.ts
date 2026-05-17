// Generates RE-YYYY-NNNN display IDs for RiskEdits.
// Counter resets each calendar year. Phase 2: replace with a DB sequence.

const COUNTER_KEY_PREFIX = 'arc:edit_id_counter:';

function counterKey(year: number): string {
  return `${COUNTER_KEY_PREFIX}${year}`;
}

export function generateEditIdDisplay(): string {
  const year = new Date().getFullYear();
  const key = counterKey(year);
  const current = parseInt(localStorage.getItem(key) ?? '0', 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return `RE-${year}-${String(next).padStart(4, '0')}`;
}
