import type { RiskEditStage } from '@/types';

const STAGES: { key: RiskEditStage; label: string; subtitle: string }[] = [
  { key: 'draft',           label: 'Author',     subtitle: 'Risk team drafting' },
  { key: 'ready_for_uat',   label: 'Queued',     subtitle: 'Awaiting tester'    },
  { key: 'uat_in_progress', label: 'UAT',        subtitle: 'AI running tests'   },
  { key: 'qa_review',       label: 'QA Review',  subtitle: 'Tester reviewing'   },
  { key: 'approved',        label: 'Approved',   subtitle: 'Awaiting bundling'  },
  { key: 'sent_to_it',      label: 'Sent to IT', subtitle: 'Ready to deploy'    },
  { key: 'live',            label: 'Live',       subtitle: 'In risk engine'     },
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
        const pending = !done && !active && !isRejected;

        // Connector after this circle is "done" only when both adjacent
        // circles are done — i.e., the one before the active circle stays
        // arc-300. When isLive, every connector turns forest.
        const connectorDone = !isRejected && (isLive || current > i + 1);

        const circleClass = isRejected
          ? 'bg-rose-50 border-rose-300 text-rose-400'
          : done
          ? 'bg-forest-500 border-forest-500 text-white'
          : active
          ? 'bg-white border-forest-500 text-forest-600'
          : 'bg-white border-arc-300 text-arc-500';

        const labelClass = isRejected
          ? 'text-rose-400'
          : done
          ? 'text-forest-600'
          : active
          ? 'text-arc-900 font-semibold'
          : 'text-arc-500';

        const subtitleClass = isRejected
          ? 'text-rose-400'
          : done
          ? 'text-forest-600'
          : active
          ? 'text-arc-700'
          : 'text-arc-300';

        return (
          <div key={stage.key} className="flex items-center">
            {/* Step circle + labels */}
            <div className="flex flex-col items-center">
              <span title={stage.subtitle} className="relative inline-flex">
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-forest-500 animate-ping"
                  />
                )}
                <span
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${circleClass}`}
                >
                  {done ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
              </span>
              <span className={`mt-2 text-xs font-semibold whitespace-nowrap ${labelClass}`}>
                {stage.label}
              </span>
              <span className={`hidden md:block text-[10px] whitespace-nowrap ${subtitleClass}`}>
                {stage.subtitle}
              </span>
            </div>

            {/* Connector */}
            {i < STAGES.length - 1 && (
              <div
                className={`h-0.5 w-10 mx-1 mb-8 transition-colors ${
                  connectorDone ? 'bg-forest-500' : 'bg-arc-300'
                }`}
              />
            )}
          </div>
        );
      })}

      {isRejected && (
        <div className="ml-4 flex items-center gap-1.5 mb-8">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            Rejected
          </span>
        </div>
      )}
    </div>
  );
}
