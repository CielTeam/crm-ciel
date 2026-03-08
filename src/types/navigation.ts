import type { LucideIcon } from 'lucide-react';
import type { AppRole } from './roles';

export interface NavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  /** If undefined, visible to all roles */
  allowedRoles?: AppRole[];
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
