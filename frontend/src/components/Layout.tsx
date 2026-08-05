import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarSeparator, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, SidebarRail } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  ShoppingCart,
  ForkKnife,
  Package,
  ChartBar,
  UserMinus,
  Users,
  Shield,
  SignOut,
} from '@phosphor-icons/react';

const navItems = [
  { path: '/', label: 'POS', permission: 'pos:use', icon: ShoppingCart },
  { path: '/menu', label: 'Menu', permission: 'menu:view', icon: ForkKnife },
  { path: '/inventory', label: 'Inventory', permission: 'inventory:view', icon: Package },
  { path: '/reports', label: 'Reports', permission: 'reports:view', icon: ChartBar },
  { path: '/consumptions', label: 'Consumptions', permission: 'consumptions:view', icon: UserMinus },
  { path: '/employees', label: 'Employees', permission: 'employees:view', icon: Users },
  { path: '/permissions', label: 'Permissions', permission: 'employees:edit', icon: Shield },
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
    <SidebarProvider>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <SidebarHeader className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ShoppingCart className="size-4" />
            </div>
            <span className="truncate text-base font-semibold group-data-[collapsible=icon]:hidden">
              Canteen POS
            </span>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.path}
                        tooltip={item.label}
                        onClick={() => navigate(item.path)}
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter className="p-2">
          <div className="group-data-[collapsible=icon]:hidden px-2 py-1.5">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Logout" onClick={handleLogout}>
                <SignOut className="size-4" />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarRail />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <span className="text-sm font-semibold">Canteen POS</span>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
