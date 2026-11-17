import { useLocation, useNavigate } from 'react-router';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import type { ElementType } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: ElementType;
}

export function NavMain({ items }: { items: NavItem[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton
                isActive={location.pathname === item.path}
                tooltip={item.label}
                onClick={() => { navigate(item.path); setOpenMobile(false); }}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
