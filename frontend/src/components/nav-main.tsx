import { useLocation, useNavigate } from 'react-router';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { NAV_GROUPS, type NavItem } from '@/lib/navigation';

/** Sidebar pages in sections (Sell · Insights · Stock · Admin); empty sections are hidden. */
export function NavMain({ items }: { items: NavItem[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  return (
    <>
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <SidebarGroup key={group} className="py-1">
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarMenu>
              {groupItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="text-sm data-active:font-semibold"
                      onClick={() => { navigate(item.path); setOpenMobile(false); }}
                    >
                      <Icon className="size-4" weight={active ? 'fill' : 'regular'} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </>
  );
}
