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
      if (e.added < 0) toast.show({ kind: 'error', message: 'Search failed. Try again.' });
      else toast.show({ kind: 'info', message: `Search finished: ${e.added} items added to review` }); // ⚑ copy
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
