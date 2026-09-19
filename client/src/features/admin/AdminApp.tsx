import { Navigate, Route, Routes } from 'react-router';
import { AdminGuard } from './AdminGuard';
import { AdminHome } from './AdminHome';
import { ReviewLayout } from './ReviewLayout';

/** Admin sub-app (lazy-loaded from main.tsx — not part of the display bundle). */
export function AdminApp() {
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
