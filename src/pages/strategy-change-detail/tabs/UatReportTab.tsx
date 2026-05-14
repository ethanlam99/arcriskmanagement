export function UatReportTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-aegis-200">
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
      <p className="text-sm font-medium">UAT Report</p>
      <p className="text-xs text-center max-w-xs">
        Coming in the next round — will show test case results, pass/fail summary cards,
        and customer-frontend screenshots once the change reaches UAT.
      </p>
    </div>
  );
}
