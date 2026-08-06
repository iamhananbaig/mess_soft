import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
  ShoppingCart,
  ForkKnife,
  Package,
  ChartBar,
  UserMinus,
  Users,
  Shield,
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

  const currentPage = navItems.find((item) => item.path === location.pathname);
  const currentPageLabel = currentPage?.label ?? 'Page';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => navigate('/')}>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ShoppingCart className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Canteen POS</span>
                  <span className="truncate text-xs text-muted-foreground">Management System</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={filteredNav} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={{ name: user?.name ?? '', email: user?.email ?? '' }} onLogout={handleLogout} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger size="icon-lg" className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {location.pathname !== '/' && (
                  <>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink onClick={() => navigate('/')}>Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentPageLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
