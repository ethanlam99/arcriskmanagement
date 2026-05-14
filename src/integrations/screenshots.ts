// INTEGRATION STUB — Phase 2 will replace with real headless-browser captures from the customer-facing frontend sandbox. Do not call external services here.
//
// Phase 2 notes:
//   - Trigger Playwright against the customer-facing frontend with the sandbox engine applied.
//   - Store screenshots in object storage (S3 / GCS) and return signed URLs.
//   - screenshot_refs in UatReport will be storage object keys, not local filenames.

// Maps seeded screenshot filenames to public asset paths
const MOCK_SCREENSHOT_MAP: Record<string, string> = {
  'screenshot-kyc-before.png':     '/mock-screenshots/screenshot-kyc-before.png',
  'screenshot-kyc-after.png':      '/mock-screenshots/screenshot-kyc-after.png',
  'screenshot-util-before.png':    '/mock-screenshots/screenshot-util-before.png',
  'screenshot-util-after.png':     '/mock-screenshots/screenshot-util-after.png',
  'screenshot-generic-before.png': '/mock-screenshots/screenshot-generic-before.png',
  'screenshot-generic-after.png':  '/mock-screenshots/screenshot-generic-after.png',
};

const FALLBACK = '/mock-screenshots/placeholder.png';

export function resolveScreenshotUrl(ref: string): string {
  return MOCK_SCREENSHOT_MAP[ref] ?? FALLBACK;
}

export function resolveScreenshotUrls(refs: string[]): string[] {
  return refs.map(resolveScreenshotUrl);
}
