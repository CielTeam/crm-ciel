import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { getFilteredNavGroups } from '@/config/navigation';
import { ROLE_LABELS } from '@/types/roles';
import { Badge } from '@/components/ui/badge';
import { useUnreadCount } from '@/hooks/useNotifications';

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { primaryRole, user } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();

  const navGroups = primaryRole ? getFilteredNavGroups(primaryRole) : [];

  // Inject unread badge into Notifications nav item
  const enrichedGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.path === '/notifications' ? { ...item, badge: unreadCount } : item
    ),
  }));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        {/* Logo section */}
        <div className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary-foreground">C</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground">CIEL</span>
              <span className="text-[10px] text-sidebar-muted">Internal CRM</span>
            </div>
          )}
        </div>

        {/* Navigation groups */}
        {enrichedGroups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-wider font-semibold px-4">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = location.pathname === item.path ||
                    (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink
                          to={item.path}
                          end={item.path === '/dashboard'}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                          activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="text-sm">{item.title}</span>}
                          {!collapsed && item.badge && item.badge > 0 && (
                            <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] text-[10px] px-1.5">
                              {item.badge}
                            </Badge>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer with role indicator */}
      {!collapsed && (
        <SidebarFooter className="bg-sidebar p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success shrink-0" />
            <span className="text-[11px] text-sidebar-muted truncate">
              {primaryRole ? ROLE_LABELS[primaryRole] : 'No role assigned'}
            </span>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
