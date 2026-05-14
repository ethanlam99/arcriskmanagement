import type { StrategyChangeStage } from '@/types';

const STAGES: { key: StrategyChangeStage; label: string }[] = [
  { key: 'draft',          label: 'Author' },
  { key: 'ready_for_uat',  label: 'Queued' },
  { key: 'uat_in_progress',label: 'UAT' },
  { key: 'qa_review',      label: 'QA Review' },
  { key: 'approved_for_it',label: 'Approved' },
  { key: 'sent_to_it',     label: 'Sent to IT' },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

function stageIndex(stage: StrategyChangeStage): number {
  if (stage === 'rejected') return -1;
  return STAGE_ORDER.indexOf(stage);
}

interface StepperProps {
  currentStage: StrategyChangeStage;
}

export function Stepper({ currentStage }: StepperProps) {
  const current = stageIndex(currentStage);
  const isRejected = currentStage === 'rejected';

  return (
    <div className="flex items-center gap-0">
      {STAGES.map((stage, i) => {
        const done    = !isRejected && current > i;
        const active  = !isRejected && current === i;
        const pending = !done && !active;

        return (
          <div key={stage.key} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors
                  ${done   ? 'bg-aegis-500 border-aegis-500 text-white' : ''}
                  ${active ? 'bg-white border-aegis-500 text-aegis-500' : ''}
                  ${pending && !isRejected ? 'bg-white border-aegis-200 text-aegis-200' : ''}
                  ${isRejected ? 'bg-rose-50 border-rose-300 text-rose-400' : ''}
                `}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`mt-1 text-xs whitespace-nowrap
                  ${active  ? 'text-aegis-700 font-semibold' : ''}
                  ${done    ? 'text-aegis-500' : ''}
                  ${pending ? 'text-aegis-200' : ''}
                  ${isRejected ? 'text-rose-400' : ''}
                `}
              >
                {stage.label}
              </span>
            </div>

            {/* Connector */}
            {i < STAGES.length - 1 && (
              <div
                className={`h-0.5 w-10 mx-1 mb-4 transition-colors
                  ${done ? 'bg-aegis-500' : 'bg-aegis-200'}
                `}
              />
            )}
          </div>
        );
      })}

      {isRejected && (
        <div className="ml-4 flex items-center gap-1.5 mb-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            Rejected
          </span>
        </div>
      )}
    </div>
  );
}
