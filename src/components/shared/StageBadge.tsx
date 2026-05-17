import { Badge } from '@/components/ui/Badge';
import type { RiskEditStage } from '@/types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STAGE_CONFIG: Record<RiskEditStage, { label: string; variant: BadgeVariant }> = {
  draft:           { label: 'Draft',          variant: 'neutral'  },
  ready_for_uat:   { label: 'Ready for UAT',  variant: 'info'     },
  uat_in_progress: { label: 'UAT Running',    variant: 'warning'  },
  qa_review:       { label: 'QA Review',      variant: 'warning'  },
  approved:        { label: 'Approved',       variant: 'success'  },
  sent_to_it:      { label: 'Sent to IT',     variant: 'success'  },
  live:            { label: 'Live',           variant: 'default'  },
  rejected:        { label: 'Rejected',       variant: 'danger'   },
};

interface StageBadgeProps {
  stage: RiskEditStage;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  const { label, variant } = STAGE_CONFIG[stage];
  return <Badge variant={variant} className={className}>{label}</Badge>;
}
