import type { Icon } from '@phosphor-icons/react';
import {
  ShoppingCart,
  ForkKnife,
  Package,
  ChartBar,
  UserMinus,
  Users,
  Shield,
  Prohibit,
  Receipt,
  Vault,
  ClockCounterClockwise,
} from '@phosphor-icons/react';

export interface NavItem {
  path: string;
  label: string;
  /** User needs ANY of these permissions. */
  permission: string[];
  icon: Icon;
  /** Shown in the phone bottom bar (most-used pages for counter staff). */
  mobileTab?: boolean;
}

/** Single source of truth for pages: drives the sidebar, the phone tab bar and route guards. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'POS', permission: ['pos:use'], icon: ShoppingCart, mobileTab: true },
  { path: '/voids', label: 'Voids', permission: ['sales:void-request', 'sales:void-approve'], icon: Prohibit, mobileTab: true },
  { path: '/cash-closing', label: 'Cash Closing', permission: ['cash:close', 'reports:view'], icon: Vault, mobileTab: true },
  { path: '/reports', label: 'Reports', permission: ['reports:view'], icon: ChartBar, mobileTab: true },
  { path: '/menu', label: 'Menu', permission: ['menu:view'], icon: ForkKnife },
  { path: '/inventory', label: 'Inventory', permission: ['inventory:view'], icon: Package },
  { path: '/consumptions', label: 'Consumptions', permission: ['consumptions:view'], icon: UserMinus },
  { path: '/receipt-design', label: 'Receipt Design', permission: ['settings:manage'], icon: Receipt },
  { path: '/employees', label: 'Employees', permission: ['employees:view'], icon: Users },
  { path: '/permissions', label: 'Permissions', permission: ['employees:edit'], icon: Shield },
  { path: '/activity', label: 'Activity Log', permission: ['activity:view'], icon: ClockCounterClockwise },
];

export function canSee(item: NavItem, hasPermission: (p: string) => boolean): boolean {
  return item.permission.some(hasPermission);
}

export function navItemFor(path: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.path === path);
}
