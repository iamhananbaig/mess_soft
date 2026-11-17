import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/components/ui/sidebar';
import { NAV_ITEMS, canSee } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { List } from '@phosphor-icons/react';

/**
 * Bottom tab bar on phones: the pages counter staff use most, one thumb-tap away.
 * "More" opens the full sidebar.
 */
export function MobileTabBar() {
  const { hasPermission } = useAuth();
  const { setOpenMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = NAV_ITEMS.filter((i) => i.mobileTab && canSee(i, hasPermission)).slice(0, 4);
  const hasMore = NAV_ITEMS.some((i) => !tabs.includes(i) && canSee(i, hasPermission));

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      <div className="flex h-16">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                active ? 'text-accent' : 'text-muted-foreground active:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="size-6" weight={active ? 'fill' : 'regular'} />
              {item.label}
            </button>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground active:text-foreground"
          >
            <List className="size-6" />
            More
          </button>
        )}
      </div>
    </nav>
  );
}
