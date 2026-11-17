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
  SquaresFour,
} from '@phosphor-icons/react';

export interface NavItem {
  path: string;
  label: string;
  /** User needs ANY of these permissions. */
  permission: string[];
  icon: Icon;
  /** Shown in the phone bottom bar (most-used pages for counter staff). */
  mobileTab?: boolean;
  /** Sidebar section. */
  group: NavGroup;
}

export type NavGroup = 'Sell' | 'Insights' | 'Stock' | 'Admin';
/** Sidebar section order. */
export const NAV_GROUPS: NavGroup[] = ['Sell', 'Insights', 'Stock', 'Admin'];

/** Single source of truth for pages: drives the sidebar, the phone tab bar and route guards. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', permission: ['reports:view'], icon: SquaresFour, mobileTab: true, group: 'Insights' },
  { path: '/', label: 'POS', permission: ['pos:use'], icon: ShoppingCart, mobileTab: true, group: 'Sell' },
  { path: '/voids', label: 'Voids', permission: ['sales:void-request', 'sales:void-approve'], icon: Prohibit, mobileTab: true, group: 'Sell' },
  { path: '/cash-closing', label: 'Cash Closing', permission: ['cash:close', 'reports:view'], icon: Vault, mobileTab: true, group: 'Sell' },
  { path: '/reports', label: 'Reports', permission: ['reports:view'], icon: ChartBar, mobileTab: true, group: 'Insights' },
  { path: '/menu', label: 'Menu', permission: ['menu:view'], icon: ForkKnife, group: 'Stock' },
  { path: '/inventory', label: 'Inventory', permission: ['inventory:view'], icon: Package, group: 'Stock' },
  { path: '/consumptions', label: 'Consumptions', permission: ['consumptions:view'], icon: UserMinus, group: 'Stock' },
  { path: '/receipt-design', label: 'Settings', permission: ['settings:manage'], icon: Receipt, group: 'Admin' },
  { path: '/employees', label: 'Employees', permission: ['employees:view'], icon: Users, group: 'Admin' },
  { path: '/permissions', label: 'Permissions', permission: ['employees:edit'], icon: Shield, group: 'Admin' },
  { path: '/activity', label: 'Activity Log', permission: ['activity:view'], icon: ClockCounterClockwise, group: 'Admin' },
];

export function canSee(item: NavItem, hasPermission: (p: string) => boolean): boolean {
  return item.permission.some(hasPermission);
}

export function navItemFor(path: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.path === path);
}
