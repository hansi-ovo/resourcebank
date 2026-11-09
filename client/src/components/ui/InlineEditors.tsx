import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { uploadImageFile } from '@/lib/uploadImage';

/**
 * Right-click context menu for cell editing (D9):
 * right-click on an editable cell → `Edit` item.
 * Positioned at cursor; closes on click-away/Escape/scroll.
 */
export function ContextMenu({
  open,
  x,
  y,
  onClose,
  onEdit,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[140px] rounded-lg border border-mist bg-surface py-1 shadow-[0_12px_32px_rgba(26,43,42,0.16)]"
      style={{ left: Math.min(x, window.innerWidth - 160), top: Math.min(y, window.innerHeight - 60) }}
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-[14px] text-ink hover:bg-canvas focus-visible:outline-2"
        style={{ outlineColor: 'var(--focus)' }}
        onClick={() => {
          onClose();
          onEdit();
        }}
      >
        Edit
      </button>
    </div>
  );
}

/** Wrap a table cell to add the D9 affordances: context menu + dblclick + hidden keyboard Edit. */
export function EditableCell({
  onEdit,
  children,
  className,
  label,
}: {
  onEdit: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <td
      className={cn('relative p-0', className)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onDoubleClick={onEdit}
    >
      <div className="flex min-h-[56px] items-center px-3 py-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          className="ml-2 rounded px-1 text-[12px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-60 hover:!opacity-100"
          aria-label={`Edit ${label}`}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={() => setMenu(null)}
        onEdit={onEdit}
      />
    </td>
  );
}

/**
 * Inline text editor: Enter saves, Escape cancels (03-pages §Review list).
 * With `imageUpload`, an Upload button sits beside the input — picking a
 * local JPG/PNG uploads it and saves the returned path in one action.
 *
 * Blur-saving is suspended while the OS file chooser is open: opening a
 * native file picker makes Chromium blur the page's focused element (the
 * text input) — committing the OLD value there would toast "Saved", unmount
 * the editor mid-upload, and leave the later file-change event orphaned on
 * a detached input (exactly the bug: "Saved fires before I picked a file,
 * then the URL never changes"). The suspension ends when the choice lands
 * (upload saves) or the chooser is dismissed (window refocus re-arms the
 * editor and hands focus back to the input).
 */
export function InlineInput({
  initial,
  onSave,
  onCancel,
  multiline,
  ariaLabel,
  imageUpload,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  multiline?: boolean;
  ariaLabel: string;
  /** adds a local-file upload button (image URL cells in the admin tables) */
  imageUpload?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // true while the OS file chooser is open — see the docblock above.
  // ref (not state): the blur handler must read it synchronously, and the
  // chooser opening must not re-render the editor.
  const chooserOpen = useRef(false);
  useEffect(() => ref.current?.focus(), []);

  // Dismissed chooser (user pressed Cancel): no change event ever fires, so
  // the window refocus is the only signal. Re-arm editing and refocus the
  // input so the admin can paste a URL or try uploading again.
  useEffect(() => {
    if (!imageUpload) return;
    const onWindowFocus = () => {
      if (chooserOpen.current && !uploading) {
        chooserOpen.current = false;
        ref.current?.focus();
      }
    };
    window.addEventListener('focus', onWindowFocus);
    return () => window.removeEventListener('focus', onWindowFocus);
  }, [imageUpload, uploading]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    chooserOpen.current = false; // a selection landed — chooser is closed
    if (!file || uploading) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      onSave(url); // upload IS the save — the parent persists + toasts
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
      ref.current?.focus(); // stay open for another try
    }
    setUploading(false);
  }

  function openFileChooser() {
    if (uploading) return;
    chooserOpen.current = true;
    fileRef.current?.click();
  }

  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    onBlur: () => {
      // chooser open or upload mid-flight: the blur is a side effect of the
      // file dialog / in-flight upload, not an intent to commit the old value
      if (chooserOpen.current || uploading) return;
      if (value.trim()) onSave(value.trim());
      else onCancel();
    },
    className:
      'w-full rounded-md border px-2 py-1.5 text-[14px] text-ink bg-surface focus-visible:outline-2',
    style: { borderColor: 'var(--focus)', outlineColor: 'var(--focus)' },
    'aria-label': ariaLabel,
  };

  const uploadControl = imageUpload ? (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onFile}
        className="hidden"
        aria-label="Upload an image file"
      />
      <button
        type="button"
        disabled={uploading}
        // keep focus in the text input (no blur-save before the upload saves)
        onMouseDown={(e) => e.preventDefault()}
        onClick={openFileChooser}
        className="shrink-0 self-start rounded px-2 py-1.5 text-[13px] font-semibold text-white disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2"
        style={{ background: 'var(--ramp-mid)', outlineColor: 'var(--focus)' }}
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </>
  ) : null;

  if (multiline) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          {...common}
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCancel();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value.trim());
          }}
        />
        {uploadControl ? <div className="flex justify-end">{uploadControl}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <input
        {...common}
        ref={ref as React.RefObject<HTMLInputElement>}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value.trim());
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {uploadControl}
    </div>
  );
}

/**
 * Audience tag input (03-pages §Review list). ONE action saves — press Enter
 * OR click Save: both commit any pending draft and persist the full list.
 * Chip removals (× / Backspace) are staged locally and persisted by the same
 * Enter/Save actions; Escape cancels the editing session.
 */
export function TagInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[];
  onSave: (v: string[]) => void;
  onCancel: () => void;
}) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  /** Stage a draft chip locally (no network call). */
  function add() {
    const v = draft.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setDraft('');
  }

  /** Commit the pending draft (if any) and persist everything in one action. */
  function commitAndSave() {
    const v = draft.trim();
    onSave(v && !tags.includes(v) ? [...tags, v] : tags);
  }

  return (
    <div
      className="w-full rounded-md border bg-surface p-1.5 focus-within:outline-2"
      style={{ borderColor: 'var(--focus)', outlineColor: 'var(--focus)' }}
      aria-label="Edit audience"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold"
            style={{ background: 'color-mix(in oklab, var(--ink) 7%, white)', color: 'var(--ink-soft)' }}
          >
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => setTags(tags.filter((x) => x !== t))}
              className="rounded-full px-1 hover:opacity-70"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Enter IS the save — commit the draft and persist immediately.
              e.preventDefault();
              commitAndSave();
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              setTags(tags.slice(0, -1));
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder="Add a tag and press Enter to save"
          aria-label="Add audience tag"
          className="min-w-[160px] flex-1 bg-transparent px-1 text-[14px] text-ink outline-none placeholder:text-ink-soft/60"
        />
      </div>
      <div className="mt-1.5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded px-2 py-1 text-[13px] text-ink-soft hover:opacity-80">
          Cancel
        </button>
        <button
          type="button"
          onClick={commitAndSave}
          className="rounded px-2 py-1 text-[13px] font-semibold text-white"
          style={{ background: 'var(--ramp-mid)' }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
