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
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getFilteredNavGroups } from '@/config/navigation';
import { ROLE_LABELS } from '@/types/roles';
import { useTotalUnreadMessages } from '@/hooks/useMessages';

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { primaryRole } = useAuth();
  const unreadMessages = useTotalUnreadMessages();

  const navGroups = primaryRole ? getFilteredNavGroups(primaryRole) : [];

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
        {navGroups.map((group) => (
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
                  const isMessages = item.path === '/messages';
                  const showBadge = isMessages && unreadMessages > 0;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink
                          to={item.path}
                          end={item.path === '/dashboard'}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors relative"
                          activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                        >
                          <div className="relative shrink-0">
                            <item.icon className="h-4 w-4" />
                            {showBadge && collapsed && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive ring-1 ring-sidebar" />
                            )}
                          </div>
                          {!collapsed && <span className="text-sm flex-1">{item.title}</span>}
                          {!collapsed && showBadge && (
                            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-semibold">
                              {unreadMessages > 99 ? '99+' : unreadMessages}
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
