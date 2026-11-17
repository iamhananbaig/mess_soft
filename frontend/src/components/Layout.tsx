import { Outlet, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { PrinterButton } from '@/components/PrinterButton';
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
import { ShoppingCart } from '@phosphor-icons/react';
import { NAV_ITEMS, canSee, navItemFor } from '@/lib/navigation';
import { MobileTabBar } from '@/components/MobileTabBar';

export function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const filteredNav = NAV_ITEMS.filter((item) => canSee(item, hasPermission));

  const currentPage = navItemFor(location.pathname);
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
      {/* Fixed to the viewport so the header stays put and the content area below
          is the one scroll container — lets pages (POS) pin panels like the cart. */}
      <SidebarInset className="h-dvh overflow-hidden">
        <header className="sticky top-0 z-30 flex h-12 md:h-16 shrink-0 items-center gap-2 border-b md:border-b-0 bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:md:h-12">
          <div className="flex items-center gap-2 px-3 md:px-4">
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
          <div className="ml-auto px-2 md:px-4">
            <PrinterButton />
          </div>
        </header>
        {/* Bottom padding on phones keeps content clear of the tab bar */}
        <div className="flex-1 min-h-0 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </div>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
