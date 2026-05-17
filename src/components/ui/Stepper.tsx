import type { RiskEditStage } from '@/types';

const STAGES: { key: RiskEditStage; label: string }[] = [
  { key: 'draft',           label: 'Author'     },
  { key: 'ready_for_uat',   label: 'Queued'     },
  { key: 'uat_in_progress', label: 'UAT'        },
  { key: 'qa_review',       label: 'QA Review'  },
  { key: 'approved',        label: 'Approved'   },
  { key: 'sent_to_it',      label: 'Sent to IT' },
  { key: 'live',            label: 'Live'       },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

function stageIndex(stage: RiskEditStage): number {
  if (stage === 'rejected') return -1;
  return STAGE_ORDER.indexOf(stage);
}

interface StepperProps {
  currentStage: RiskEditStage;
}

export function Stepper({ currentStage }: StepperProps) {
  const current = stageIndex(currentStage);
  const isRejected = currentStage === 'rejected';
  const isLive     = currentStage === 'live';

  return (
    <div className="flex items-center gap-0">
      {STAGES.map((stage, i) => {
        // At live, show every step (including the last) as completed.
        const done    = !isRejected && (current > i || (isLive && current === i));
        const active  = !isRejected && !isLive && current === i;
        const pending = !done && !active;

        return (
          <div key={stage.key} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors
                  ${done   ? 'bg-arc-500 border-arc-500 text-white' : ''}
                  ${active ? 'bg-white border-arc-500 text-arc-500' : ''}
                  ${pending && !isRejected ? 'bg-white border-arc-200 text-arc-200' : ''}
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
                  ${active  ? 'text-arc-700 font-semibold' : ''}
                  ${done    ? 'text-arc-500' : ''}
                  ${pending ? 'text-arc-200' : ''}
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
                  ${done || isLive ? 'bg-arc-500' : 'bg-arc-200'}
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
