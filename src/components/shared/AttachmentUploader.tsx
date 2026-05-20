import { useRef, useState, type DragEvent } from 'react';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';

export interface AttachmentRecord {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

interface AttachmentUploaderProps {
  attachments: AttachmentRecord[];
  onUpload: (file: {
    filename: string;
    mime_type: string;
    size_bytes: number;
    content_base64: string;
  }) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  readonly?: boolean;
  maxFiles?: number;
  maxSizeBytes?: number;
}

const ACCEPT = 'image/*,application/pdf';
const ALLOWED_PREFIXES = ['image/', 'application/pdf'];
const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function UploaderName({ userId }: { userId: string }) {
  const repo = useRepository();
  const { data } = useQuery({
    queryKey: ['arc', 'users', userId],
    queryFn: () => repo.users.get(userId),
    enabled: !!userId && userId !== 'system',
  });
  if (userId === 'system') return <>system</>;
  return <>{data?.name ?? 'Unknown'}</>;
}

export function AttachmentUploader({
  attachments,
  onUpload,
  onRemove,
  readonly = false,
  maxFiles = DEFAULT_MAX_FILES,
  maxSizeBytes = DEFAULT_MAX_SIZE,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFiles(fileList: FileList | File[]) {
    if (readonly) return;
    setError(null);
    const files = Array.from(fileList);

    const remaining = maxFiles - attachments.length;
    if (remaining <= 0) {
      setError(`Maximum ${maxFiles} files reached. Remove one to add another.`);
      return;
    }
    if (files.length > remaining) {
      setError(
        `Only ${remaining} more file${remaining !== 1 ? 's' : ''} allowed (max ${maxFiles}).`
      );
      return;
    }

    for (const file of files) {
      if (!ALLOWED_PREFIXES.some((p) => file.type.startsWith(p))) {
        setError(`"${file.name}" is not an image or PDF.`);
        return;
      }
      if (file.size > maxSizeBytes) {
        setError(
          `"${file.name}" is ${formatSize(file.size)} — exceeds the ${formatSize(maxSizeBytes)} limit.`
        );
        return;
      }
    }

    setBusy(true);
    try {
      for (const file of files) {
        const content_base64 = await readFileAsBase64(file);
        await onUpload({
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          content_base64,
        });
      }
    } catch (e) {
      setError(`Upload failed: ${String(e)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (readonly) return;
    if (e.dataTransfer.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  const limitReached = attachments.length >= maxFiles;

  return (
    <div className="flex flex-col gap-2">
      {!readonly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          className={`rounded-lg border border-dashed transition-colors px-3 py-4 text-center ${
            isDragOver
              ? 'border-arc-500 dark:border-arc-dark-500 bg-arc-100 dark:bg-arc-dark-100'
              : limitReached
              ? 'border-arc-200 dark:border-arc-dark-200 bg-arc-100/40 dark:bg-arc-dark-100/40 opacity-60'
              : 'border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 hover:border-arc-300'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            disabled={busy || limitReached}
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || limitReached}
            className="text-xs font-medium text-arc-500 dark:text-arc-dark-500 hover:text-arc-700 dark:hover:text-arc-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Uploading…' : limitReached ? 'Limit reached' : 'Choose files or drag here'}
          </button>
          <p className="text-[11px] text-arc-500 dark:text-arc-dark-500 mt-1">
            Image or PDF · ≤ {formatSize(maxSizeBytes)} each · {attachments.length}/{maxFiles} used
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-arc-500 dark:text-arc-dark-500 italic">No attachments yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-2.5 py-1.5"
            >
              <span className="text-arc-500 dark:text-arc-dark-500 shrink-0" aria-hidden>
                {a.mime_type.startsWith('image/') ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16m-2-2l1.5-1.5a2 2 0 012.8 0L20 14m-12 6h8a4 4 0 004-4V8a4 4 0 00-4-4H8a4 4 0 00-4 4v8a4 4 0 004 4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-7 4h8a2 2 0 002-2V8l-5-5H7a2 2 0 00-2 2v13a2 2 0 002 2z" />
                  </svg>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-arc-900 dark:text-arc-dark-700 truncate">{a.filename}</p>
                <p className="text-[11px] text-arc-500 dark:text-arc-dark-500">
                  {formatSize(a.size_bytes)} · <UploaderName userId={a.uploaded_by} /> ·{' '}
                  {new Date(a.uploaded_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => void onRemove(a.id)}
                  className="shrink-0 text-arc-500 dark:text-arc-dark-500 hover:text-rose-600 transition-colors text-sm leading-none px-1"
                  aria-label={`Remove ${a.filename}`}
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
