import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { CloseIcon } from './icons';

/**
 * Search-settings popover: manages the WeChat official-account whitelist.
 * Whitelisted accounts are the ONLY WeChat articles the search round
 * considers (their names also become targeted queries server-side).
 */

interface WhitelistData {
  names: string[];
}

export function WhitelistPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [names, setNames] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<WhitelistData>('/api/wechat-whitelist');
      setNames(data.names);
    } catch {
      toast.show({ kind: 'error', message: 'Could not load the whitelist.' });
      setNames([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const data = await api.post<WhitelistData>('/api/wechat-whitelist/add', { name });
      setNames(data.names);
      setDraft('');
      toast.show({ kind: 'saved', message: `Added “${name}” to the whitelist` });
    } catch {
      toast.show({ kind: 'error', message: 'Could not add the account.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.post<WhitelistData>('/api/wechat-whitelist/remove', { name });
      setNames(data.names);
      toast.show({ kind: 'removed', message: `Removed “${name}”` });
    } catch {
      toast.show({ kind: 'error', message: 'Could not remove the account.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="WeChat whitelist settings"
      className="absolute right-0 top-12 z-40 w-[360px] rounded-xl border border-mist bg-surface p-4 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">WeChat whitelist</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close whitelist settings"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2"
          style={{ outlineColor: 'var(--focus)' }}
        >
          <CloseIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        Only articles from these accounts enter the review list. New accounts apply from the next search on.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          type="text"
          aria-label="Official account name"
          placeholder="e.g. Impact Circle"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-mist bg-canvas px-3 py-2 text-[14px] text-ink placeholder:text-ink-soft/60 focus-visible:outline-2"
          style={{ outlineColor: 'var(--focus)' }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className="rounded-lg px-3 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--ramp-mid)' }}
        >
          Add
        </button>
      </form>

      {names === null ? (
        <p className="mt-3 text-[13px] text-ink-soft" aria-live="polite">…</p>
      ) : names.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-soft">No whitelisted accounts — every WeChat article is considered.</p>
      ) : (
        <ul className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {names.map((n) => (
            <li key={n}>
              <span
                className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-[13px] font-semibold"
                style={{ background: 'color-mix(in oklab, var(--ramp-mid) 12%, white)', color: 'var(--ramp-mid-deep)' }}
              >
                {n}
                <button
                  type="button"
                  onClick={() => void remove(n)}
                  aria-label={`Remove ${n} from whitelist`}
                  className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-white/70 focus-visible:outline-2"
                  style={{ outlineColor: 'var(--focus)' }}
                >
                  <CloseIcon className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
