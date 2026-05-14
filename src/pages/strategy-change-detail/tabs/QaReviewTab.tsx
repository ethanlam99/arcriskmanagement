export function QaReviewTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-aegis-200">
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      <p className="text-sm font-medium">QA Review</p>
      <p className="text-xs text-center max-w-xs">
        Coming in the next round — testers will annotate the UAT report, override individual
        test cases, and issue a final approval or rejection here.
      </p>
    </div>
  );
}
