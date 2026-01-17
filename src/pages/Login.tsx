import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Zap, AlertTriangle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const success = await login(username, password);
    
    if (!success) {
      setError('Invalid credentials. Please try again.');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-scada-normal/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-scada-info/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-scada-normal/10 border border-scada-normal/30 glow-normal mb-4">
            <Zap className="h-10 w-10 text-scada-normal" />
          </div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            SMART GRID SCADA
          </h1>
          <p className="text-sm font-mono text-muted-foreground mt-1">
            SECURE CONTROL & DATA ACQUISITION
          </p>
        </div>

        {/* Login form */}
        <div className="relative rounded-lg border border-border bg-card/80 backdrop-blur p-8">
          {/* Decorative corners */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-scada-normal" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-scada-normal" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-scada-normal" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-scada-normal" />

          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-scada-normal" />
            <span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
              Authentication Required
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-mono uppercase tracking-wider">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="font-mono bg-secondary/50 border-border focus:border-scada-normal focus:ring-scada-normal"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-mono uppercase tracking-wider">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="font-mono bg-secondary/50 border-border focus:border-scada-normal focus:ring-scada-normal"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded bg-scada-critical/10 border border-scada-critical/30">
                <AlertTriangle className="h-4 w-4 text-scada-critical" />
                <span className="text-sm font-mono text-scada-critical">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full font-mono uppercase tracking-wider bg-scada-normal text-primary-foreground hover:bg-scada-normal/80 glow-normal"
            >
              {isLoading ? 'Authenticating...' : 'Access System'}
            </Button>
          </form>

          {/* Hint */}
          <div className="mt-6 p-3 rounded bg-secondary/50 border border-border">
            <p className="text-xs font-mono text-muted-foreground">
              <span className="text-scada-info">Demo credentials:</span>
              <br />
              Admin: admin / admin123
              <br />
              Operator: operator / operator123
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs font-mono text-muted-foreground">
          <p>SCADA System v2.0 | Enhanced Security</p>
          <p className="mt-1">SQLAlchemy + Threat Intelligence + Real-time API</p>
        </div>
      </div>
    </div>
  );
}
