import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import type { RiskEditStage } from '@/types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'live';

const STAGE_VARIANT: Record<RiskEditStage, BadgeVariant> = {
  draft:           'neutral',
  ready_for_uat:   'info',
  uat_in_progress: 'warning',
  qa_review:       'warning',
  approved:        'success',
  sent_to_it:      'success',
  live:            'live',
  rejected:        'danger',
};

interface StageBadgeProps {
  stage: RiskEditStage;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANT[stage]} className={className}>
      {t(`stage.${stage}`)}
    </Badge>
  );
}
