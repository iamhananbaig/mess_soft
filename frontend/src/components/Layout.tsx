import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ShoppingCart,
  ForkKnife,
  Package,
  Scroll,
  ChartBar,
  UserMinus,
  Users,
  SignOut,
  List,
} from '@phosphor-icons/react';

const navItems = [
  { path: '/', label: 'POS', permission: 'pos:use', icon: ShoppingCart },
  { path: '/menu', label: 'Menu', permission: 'menu:view', icon: ForkKnife },
  { path: '/inventory', label: 'Inventory', permission: 'inventory:view', icon: Package },
  { path: '/recipes', label: 'Recipes', permission: 'recipes:manage', icon: Scroll },
  { path: '/reports', label: 'Reports', permission: 'reports:view', icon: ChartBar },
  { path: '/consumptions', label: 'Consumptions', permission: 'consumptions:view', icon: UserMinus },
  { path: '/employees', label: 'Employees', permission: 'employees:view', icon: Users },
];

export function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = navItems.filter((item) => hasPermission(item.permission));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNav = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'w-56 bg-gray-900 text-white flex flex-col fixed inset-y-0 left-0 z-40 transition-transform lg:translate-x-0 lg:static',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4">
          <h1 className="text-lg font-bold">Canteen POS</h1>
        </div>
        <Separator className="bg-gray-700" />
        <nav className="flex-1 p-2 space-y-0.5">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2.5',
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                <Icon className="size-4 shrink-0" weight={isActive ? 'fill' : 'regular'} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="text-sm text-gray-400 mb-2 truncate">{user?.name}</div>
          <Button variant="outline" size="sm" className="w-full text-gray-300 border-gray-700 hover:bg-gray-800" onClick={handleLogout}>
            <SignOut className="size-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 bg-muted/30 overflow-auto">
        <div className="lg:hidden flex items-center p-3 bg-white border-b">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
            <List className="size-5" />
          </Button>
          <span className="ml-2 font-bold">Canteen POS</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
