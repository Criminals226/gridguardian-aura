import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/scada/StatusIndicator';
import { useSocket } from '@/hooks/useSocket';
import {
  LayoutDashboard,
  Shield,
  BarChart3,
  FileText,
  LogOut,
  Zap,
  User,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Security', href: '/security', icon: Shield },
  { name: 'Historical', href: '/historical', icon: BarChart3 },
  { name: 'Logs', href: '/logs', icon: FileText },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isConnected } = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-card"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-sidebar-border">
          <div className="p-2 rounded-lg bg-scada-normal/10 border border-scada-normal/30">
            <Zap className="h-5 w-5 text-scada-normal" />
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold text-sidebar-foreground">SMART GRID</h1>
            <p className="text-xs font-mono text-muted-foreground">SCADA System</p>
          </div>
        </div>

        {/* Connection status */}
        <div className="px-6 py-3 border-b border-sidebar-border">
          <StatusIndicator
            status={isConnected ? 'normal' : 'offline'}
            label={isConnected ? 'Connected' : 'Disconnected'}
            size="sm"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg font-mono text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary border border-sidebar-primary/30'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sidebar-accent/30">
            <div className="p-2 rounded-full bg-secondary">
              <User className="h-4 w-4 text-sidebar-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-medium text-sidebar-foreground truncate">
                {user?.full_name || user?.username}
              </p>
              <p className="text-xs font-mono text-muted-foreground uppercase">
                {user?.role}
              </p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full mt-2 font-mono justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4 mr-3" />
            Logout
          </Button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs font-mono text-muted-foreground text-center">
            SCADA v2.0 | Enhanced Security
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className={cn(
        'min-h-screen transition-all duration-300',
        'lg:ml-64'
      )}>
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
          <div className="h-full flex items-center justify-between px-6 lg:px-8">
            <div className="lg:hidden w-12" /> {/* Spacer for mobile menu button */}
            
            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right">
                <p className="text-xs font-mono text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
                <p className="text-sm font-mono text-foreground font-medium">
                  {new Date().toLocaleTimeString('en-US', { hour12: false })}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
