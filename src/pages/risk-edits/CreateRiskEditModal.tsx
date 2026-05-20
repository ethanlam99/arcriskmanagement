import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useCreateRiskEdit } from '@/hooks/useRiskEdits';
import { useEngineModules } from '@/hooks/useEngineModules';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, FormField } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface CreateRiskEditModalProps {
  defaultModuleId?: string;
  onClose: () => void;
}

export function CreateRiskEditModal({ defaultModuleId, onClose }: CreateRiskEditModalProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { data: modules = [] } = useEngineModules();
  const createMutation = useCreateRiskEdit();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [moduleId, setModuleId] = useState(defaultModuleId ?? modules[0]?.id ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;

    const edit = await createMutation.mutateAsync({
      title,
      natural_language_brief: brief,
      target_module_id: moduleId,
      current_stage: 'draft',
      created_by: currentUser.id,
      updated_at: new Date().toISOString(),
    });

    onClose();
    navigate(`/risk-edits/${edit.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-arc-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-arc-200 w-full max-w-lg mx-4 p-6 shadow-lg">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-arc-900">{t('risk_edits.create_title')}</h2>
          <p className="text-xs text-arc-500 mt-0.5">{t('risk_edits.create_subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label={t('risk_edits.field_title')}>
            <Input
              required
              placeholder={t('risk_edits.field_title_placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>

          <FormField label={t('risk_edits.field_module')}>
            <Select
              required
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>{m.module_name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label={t('risk_edits.field_brief')}>
            <Textarea
              required
              rows={5}
              placeholder={t('risk_edits.field_brief_placeholder')}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending}
              disabled={!title || !moduleId || !brief}
            >
              {t('risk_edits.create_submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
