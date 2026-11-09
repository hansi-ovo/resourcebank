import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CATEGORIES, type CategoryId, type Entry, type UrlImportResult } from 'shared/types';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { uploadImageFile } from '@/lib/uploadImage';

/**
 * Manual add tab (left-nav "Add manually"): the admin types a program's
 * fields — mirroring the review table header columns — and confirms.
 * The entry is created straight into Content management (published,
 * source=manual); the admin's manual entry IS the review decision.
 */

const inputCls =
  'w-full rounded-lg border border-mist bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-soft/60 focus-visible:outline-2';
const focusStyle = { outlineColor: 'var(--focus)' };

function Field({
  label,
  required,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[14px] font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5" style={{ color: 'var(--ramp-mid-deep)' }}>
            *
          </span>
        ) : (
          <span className="ml-2 text-[13px] font-normal text-ink-soft">optional</span>
        )}
      </label>
      {hint ? <p className="mt-0.5 text-[13px] text-ink-soft">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function ManualAddTab() {
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryId>('on-campus');
  const [timeline, setTimeline] = useState('');
  const [url, setUrl] = useState('');
  const [audience, setAudience] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [summary, setSummary] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // auto-recognition box (top of the form): paste a link → every field below
  // is filled from the page's content; the admin adjusts then confirms.
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // local image upload state (Image URL field)
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  async function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || uploadingImage) return;
    setUploadingImage(true);
    try {
      const url = await uploadImageFile(file);
      setImageUrl(url);
      toast.show({ kind: 'saved', message: 'Image uploaded' });
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
    }
    setUploadingImage(false);
  }

  async function recognize(e: FormEvent) {
    e.preventDefault();
    const u = importUrl.trim();
    if (!u || importing) return;
    setImporting(true);
    try {
      const draft = await api.post<UrlImportResult>('/api/import-url', { url: u });
      setName(draft.name);
      setSummary(draft.summary);
      setUrl(draft.url); // final URL after redirects
      setAudience(draft.audience);
      setTagDraft('');
      setTimeline(draft.timeline);
      setImageUrl(draft.imageUrl ?? '');
      if (draft.category) setCategory(draft.category);
      toast.show({ kind: 'saved', message: 'Recognized — check each field, then confirm' });
    } catch (err) {
      toast.show({
        kind: 'error',
        message: err instanceof Error && err.message
          ? err.message
          : 'Could not recognize that page. Fill the form manually.',
      });
    }
    setImporting(false);
  }

  function addTag() {
    const v = tagDraft.trim();
    if (v && !audience.includes(v) && audience.length < 12) setAudience([...audience, v]);
    setTagDraft('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // A tag typed but not yet committed with Enter still counts — saving
      // the form alone (or pressing Enter anywhere to submit) must persist it.
      const pending = tagDraft.trim();
      const finalAudience =
        pending && !audience.includes(pending) && audience.length < 12 ? [...audience, pending] : audience;
      await api.post<Entry>('/api/entries', {
        name: name.trim(),
        summary: summary.trim(),
        url: url.trim(),
        category,
        audience: finalAudience,
        timeline: timeline.trim(),
        notes: notes.trim(),
        imageUrl: imageUrl.trim(),
      });
      toast.show({ kind: 'saved', message: 'Added to Content management' });
      navigate('/admin/review/content-management');
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('URL already exists')
        ? 'That web link is already in the database.'
        : 'Could not add. Check the required fields and try again.';
      toast.show({ kind: 'error', message: msg });
      setSaving(false);
    }
  }

  return (
    <section aria-label="Add manually" className="w-full max-w-[720px]">
      <h2 className="font-display text-[24px] font-semibold text-ink">Add a program manually</h2>
      <p className="mt-1 max-w-[60ch] text-[14px] text-ink-soft">
        Paste a link to auto-fill the form, or type the details yourself — it
        goes straight into Content management and appears on the display site.
      </p>

      {/* auto-recognition: URL in → every field below filled from the page */}
      <form onSubmit={recognize} className="mt-6">
        <label htmlFor="manual-import-url" className="block text-[14px] font-medium text-ink">
          Recognize from a web page
        </label>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          Paste the program's link (short links like lnkd.in work too) — the timeline, overview and
          the rest fill in automatically.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            id="manual-import-url"
            type="url"
            className={inputCls}
            style={focusStyle}
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://…"
            disabled={importing}
          />
          <button
            type="submit"
            disabled={importing || importUrl.trim().length === 0}
            className="shrink-0 rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2"
            style={{ background: 'var(--ramp-mid)', outlineColor: 'var(--focus)' }}
          >
            {importing ? 'Recognizing…' : 'Recognize'}
          </button>
        </div>
      </form>

      <div aria-hidden className="my-6 border-t border-mist" />

      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Program" required htmlFor="manual-name">
          <input
            id="manual-name"
            className={inputCls}
            style={focusStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Schwarzman Scholars"
            required
          />
        </Field>

        <Field label="Category" required htmlFor="manual-category">
          <div role="radiogroup" aria-label="Category" id="manual-category" className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(c.id)}
                  className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-2"
                  style={
                    active
                      ? { background: 'var(--ink)', color: 'white', outlineColor: 'var(--focus)' }
                      : {
                          background: `color-mix(in oklab, ${c.tint} 10%, white)`,
                          color: c.tint,
                          outlineColor: 'var(--focus)',
                        }
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Application timeline"
          htmlFor="manual-timeline"
          hint="Free text, e.g. &quot;Session 3 Week 6 - Session 4 Week 1&quot;"
        >
          <textarea
            id="manual-timeline"
            className={inputCls}
            style={focusStyle}
            rows={2}
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
          />
        </Field>

        <Field label="Web link" required htmlFor="manual-url">
          <input
            id="manual-url"
            type="url"
            className={inputCls}
            style={focusStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            required
          />
        </Field>

        <Field label="Eligibility" htmlFor="manual-audience" hint="Press Enter to add a tag">
          <div
            id="manual-audience"
            className="w-full rounded-lg border border-mist bg-surface p-2 focus-within:outline-2"
            style={{ outlineColor: 'var(--focus)' }}
          >
            {audience.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {audience.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold"
                    style={{ background: 'color-mix(in oklab, var(--ink) 7%, white)', color: 'var(--ink-soft)' }}
                  >
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove ${t}`}
                      onClick={() => setAudience(audience.filter((x) => x !== t))}
                      className="rounded-full px-1 hover:opacity-70"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="e.g. First-generation students"
              aria-label="Add eligibility tag"
              className="w-full bg-transparent px-1 text-[14px] text-ink outline-none placeholder:text-ink-soft/60"
            />
          </div>
        </Field>

        <Field label="Overview" required htmlFor="manual-summary">
          <textarea
            id="manual-summary"
            className={inputCls}
            style={focusStyle}
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
          />
        </Field>

        <Field
          label="Image URL"
          htmlFor="manual-image"
          hint="Paste an image link, or upload a JPG / PNG / WebP / GIF from your computer"
        >
          <div className="flex gap-2">
            <input
              id="manual-image"
              type="text"
              className={inputCls}
              style={focusStyle}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… (left empty → category placeholder art)"
            />
            <input
              ref={imageFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onImageFile}
              className="hidden"
              aria-label="Upload an image file"
            />
            <button
              type="button"
              disabled={uploadingImage}
              onClick={() => imageFileRef.current?.click()}
              className="shrink-0 rounded-lg border border-mist bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:border-ink-soft/40 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2"
              style={{ outlineColor: 'var(--focus)' }}
            >
              {uploadingImage ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </Field>

        <Field label="Notes" htmlFor="manual-notes" hint="Admin-only, never shown on the display site">
          <textarea
            id="manual-notes"
            className={inputCls}
            style={focusStyle}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            style={{ background: 'var(--ramp-mid)' }}
          >
            {saving ? 'Adding…' : 'Add to Content management'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/review/content-management')}
            className="rounded-lg border border-mist bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:border-ink-soft/40"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
