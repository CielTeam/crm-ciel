import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Palmtree,
  MessageSquare,
  Video,
  Users,
  Settings,
  Shield,
  Activity,
  Target,
  Building2,
  Briefcase,
  Ticket,
  ListChecks,
  FolderKanban,
} from 'lucide-react';
import type { NavGroup } from '@/types/navigation';
import type { AppRole } from '@/types/roles';
import { ADMIN_ROLES, LEADS_ROLES } from '@/types/roles';

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { title: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { title: 'Calendar', path: '/calendar', icon: Calendar },
      { title: 'Tasks', path: '/tasks', icon: CheckSquare },
      { title: 'Projects', path: '/projects', icon: FolderKanban },
      { title: 'Tickets', path: '/tickets', icon: Ticket },
      {
        title: 'All Tasks',
        path: '/all-tasks',
        icon: ListChecks,
        allowedRoles: ['chairman','vice_president','head_of_operations','technical_lead','team_development_lead','head_of_accounting','head_of_marketing','sales_lead','hr'],
      },
      { title: 'Leaves', path: '/leaves', icon: Palmtree },
    ],
  },
  {
    label: 'Communication',
    items: [
      { title: 'Messages', path: '/messages', icon: MessageSquare },
      { title: 'Meetings', path: '/meetings', icon: Video },
    ],
  },
  {
    label: 'Organization',
    items: [
      { title: 'Directory', path: '/directory', icon: Users },
      {
        title: 'Leads',
        path: '/leads',
        icon: Target,
        allowedRoles: LEADS_ROLES,
      },
      {
        title: 'Accounts',
        path: '/accounts',
        icon: Building2,
        allowedRoles: LEADS_ROLES,
      },
      {
        title: 'Opportunities',
        path: '/opportunities',
        icon: Briefcase,
        allowedRoles: LEADS_ROLES,
      },
      { title: 'Settings', path: '/settings', icon: Settings },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        title: 'Admin Console',
        path: '/admin',
        icon: Shield,
        allowedRoles: ADMIN_ROLES,
      },
      {
        title: 'Audit Logs',
        path: '/admin/audit',
        icon: Activity,
        allowedRoles: ADMIN_ROLES,
      },
    ],
  },
];

export function getFilteredNavGroups(role: AppRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.allowedRoles || item.allowedRoles.includes(role)
    ),
  })).filter((group) => group.items.length > 0);
}
