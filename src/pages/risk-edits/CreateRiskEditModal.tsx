import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
          <h2 className="text-base font-semibold text-arc-900">New Risk Edit</h2>
          <p className="text-xs text-arc-200 mt-0.5">
            Describe what you want to change — the AI will help you translate this into SQL.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title">
            <Input
              required
              placeholder="e.g. Increase loan limit for high-income customers"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>

          <FormField label="Target Engine Module">
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

          <FormField label="Edit Brief">
            <Textarea
              required
              rows={5}
              placeholder="Describe the change in plain language. Be specific about thresholds, segments, and expected behaviour…"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending}
              disabled={!title || !moduleId || !brief}
            >
              Create & Open
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
