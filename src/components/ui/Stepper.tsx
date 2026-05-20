import { useTranslation } from 'react-i18next';
import type { RiskEditStage } from '@/types';

const STAGES: { key: RiskEditStage; labelKey: string; subtitleKey: string }[] = [
  { key: 'draft',           labelKey: 'stepper.author',     subtitleKey: 'stepper.sub_author'     },
  { key: 'ready_for_uat',   labelKey: 'stepper.queued',     subtitleKey: 'stepper.sub_queued'     },
  { key: 'uat_in_progress', labelKey: 'stepper.uat',        subtitleKey: 'stepper.sub_uat'        },
  { key: 'qa_review',       labelKey: 'stepper.qa_review',  subtitleKey: 'stepper.sub_qa_review'  },
  { key: 'approved',        labelKey: 'stepper.approved',   subtitleKey: 'stepper.sub_approved'   },
  { key: 'sent_to_it',      labelKey: 'stepper.sent_to_it', subtitleKey: 'stepper.sub_sent_to_it' },
  { key: 'live',            labelKey: 'stepper.live',       subtitleKey: 'stepper.sub_live'       },
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
  const { t } = useTranslation();
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

        const subtitle = t(stage.subtitleKey);

        return (
          <div key={stage.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <span title={subtitle} className="relative inline-flex">
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
                {t(stage.labelKey)}
              </span>
              <span className={`hidden md:block text-[10px] whitespace-nowrap ${subtitleClass}`}>
                {subtitle}
              </span>
            </div>

            {i < STAGES.length - 1 && (
              <div
                className={`h-0.5 w-10 mx-1 mb-8 transition-colors ${
                  connectorDone ? 'bg-forest-500' : 'bg-arc-300'
                }`}
              />
            )}
            {pending && null}
          </div>
        );
      })}

      {isRejected && (
        <div className="ml-4 flex items-center gap-1.5 mb-8">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            {t('stepper.rejected_label')}
          </span>
        </div>
      )}
    </div>
  );
}
