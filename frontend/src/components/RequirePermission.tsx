import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, canSee, navItemFor } from '@/lib/navigation';
import { PageSpinner } from '@/components/PageSpinner';
import { EmptyState } from '@/components/EmptyState';

/**
 * Renders the page only if the user has its permission. Otherwise sends them
 * to the first page they can use (e.g. a cashier opening /reports lands on POS),
 * instead of a half-loaded page full of 403 errors.
 */
export function RequirePermission({ path, children }: { path: string; children: ReactNode }) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();

  if (!user) return <PageSpinner />;

  const item = navItemFor(path);
  if (!item || canSee(item, hasPermission)) return <>{children}</>;

  const fallback = NAV_ITEMS.find((i) => canSee(i, hasPermission));
  if (fallback && fallback.path !== location.pathname) return <Navigate to={fallback.path} replace />;

  return (
    <div className="p-6">
      <EmptyState title="No access" description="Your account has no pages assigned yet. Ask an admin to give your role permissions." />
    </div>
  );
}
