import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Brain, Copy, ExternalLink } from "lucide-react";

const useVersion = () => {
  const [version, setVersion] = useState<string>("0.0.0.0");

  useEffect(() => {
    const fetchVersion = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "app_version")
        .maybeSingle();
      
      if (data?.value) {
        setVersion(typeof data.value === 'string' ? data.value : (data.value as any).version || "0.0.0.0");
      }
    };
    fetchVersion();
  }, []);

  return version;
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/crossatrix-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast({
          title: "Welcome!",
          description: "Signed in with Crossatrix Account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials. Make sure you have a Crossatrix account.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const version = useVersion();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <span className="absolute bottom-4 left-4 text-xs text-muted-foreground">v{version}</span>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Brain className="w-12 h-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">AI Chat</CardTitle>
          <CardDescription>
            Sign in with your Crossatrix Account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In with Crossatrix"}
            </Button>
          </form>

          <div className="mt-4 space-y-3">
            <div className="text-center">
              <a
                href="https://crossatrix.lovable.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                Don't have an account? Create one at Crossatrix
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowMigration(!showMigration)}
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
              >
                {showMigration ? "Hide migration info" : "Had an old account? Migrate here"}
              </button>
            </div>

            {showMigration && (
              <MigrationInfo />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const MigrationInfo = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Check if there's a stored legacy user id
    const stored = localStorage.getItem("legacy_user_id");
    if (stored) setUserId(stored);
  }, []);

  const handleLegacyLogin = async () => {
    const email = (document.getElementById("legacy-email") as HTMLInputElement)?.value;
    const password = (document.getElementById("legacy-password") as HTMLInputElement)?.value;

    if (!email || !password) return;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const uid = data.user?.id;
      if (uid) {
        setUserId(uid);
        localStorage.setItem("legacy_user_id", uid);
        // Sign out immediately - they need to create Crossatrix account
        await supabase.auth.signOut();
        toast({
          title: "User ID found!",
          description: "Copy your ID below and create a Crossatrix account to continue.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyUserId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      toast({ title: "Copied!", description: "User ID copied to clipboard." });
    }
  };

  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        If you had an old account, log in below to get your User ID. Then create a Crossatrix account at{" "}
        <a href="https://crossatrix.lovable.app" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          crossatrix.lovable.app
        </a>{" "}
        and enter your old User ID during signup to migrate your data.
      </p>

      {!userId ? (
        <div className="space-y-2">
          <Input id="legacy-email" type="email" placeholder="Old email" className="text-sm" />
          <Input id="legacy-password" type="password" placeholder="Old password" className="text-sm" />
          <Button size="sm" variant="secondary" className="w-full" onClick={handleLegacyLogin}>
            Get My User ID
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium">Your User ID:</p>
          <div className="flex gap-2">
            <Input value={userId} readOnly className="text-xs font-mono" />
            <Button size="icon" variant="outline" onClick={copyUserId}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <a
            href="https://crossatrix.lovable.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="default" className="w-full mt-2">
              Create Crossatrix Account <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </a>
          <button
            className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => {
              localStorage.removeItem("legacy_user_id");
              setUserId(null);
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default Auth;
