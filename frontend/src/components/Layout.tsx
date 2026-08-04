import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'POS', permission: 'pos:use' },
  { path: '/menu', label: 'Menu', permission: 'menu:view' },
  { path: '/inventory', label: 'Inventory', permission: 'inventory:view' },
  { path: '/recipes', label: 'Recipes', permission: 'recipes:manage' },
  { path: '/reports', label: 'Reports', permission: 'reports:view' },
  { path: '/consumptions', label: 'Consumptions', permission: 'consumptions:view' },
  { path: '/employees', label: 'Employees', permission: 'employees:view' },
];

export function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const filteredNav = navItems.filter((item) => hasPermission(item.permission));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-4">
          <h1 className="text-lg font-bold">Canteen POS</h1>
        </div>
        <Separator className="bg-gray-700" />
        <nav className="flex-1 p-2 space-y-1">
          {filteredNav.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                location.pathname === item.path
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="text-sm text-gray-400 mb-2">{user?.name}</div>
          <Button variant="outline" size="sm" className="w-full text-gray-300 border-gray-700 hover:bg-gray-800" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
