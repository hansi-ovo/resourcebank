import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AdminGuard } from './AdminGuard';
import { AdminHome } from './AdminHome';
import { ReviewLayout } from './ReviewLayout';
import { useToast } from '@/components/ui/Toast';
import { followRunningSearch, onSearchFinished } from '@/lib/searchRunner';

/** Admin sub-app (lazy-loaded from main.tsx — not part of the display bundle). */
export function AdminApp() {
  const toast = useToast();

  useEffect(() => {
    // global search-finish toast (fires wherever the admin is in the app)
    const off = onSearchFinished((e) => {
      if (e.added < 0) {
        toast.show({ kind: 'error', message: 'Search failed. Try again.' });
        return;
      }
      let message = `Search finished: ${e.added} items added to review`; // ⚑ copy
      // Saturation report — when nothing came back, say WHY (e2e matches the
      // base sentence, so the detail is appended, never replaces it).
      if (e.stats && e.added === 0 && e.stats.dedupSkipped + e.stats.lowQuality > 0) {
        message += ` — ${e.stats.dedupSkipped} already known, ${e.stats.lowQuality} below quality bar`;
      }
      toast.show({ kind: 'info', message });
    });
    // re-attach to a server-side running search if this page (re)loaded mid-job
    let offFollow: (() => void) | undefined;
    void followRunningSearch().then((cleanup) => {
      offFollow = cleanup;
    });
    return () => {
      off();
      offFollow?.();
    };
  }, [toast]);

  return (
    <AdminGuard>
      <Routes>
        <Route path="/" element={<AdminHome />} />
        <Route path="/review/:tab" element={<ReviewLayout />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminGuard>
  );
}
