import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, Plug, Mail, HardDrive, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { useConnectors, type ConnectorTool } from "@/hooks/useConnectors";
import { toast } from "@/hooks/use-toast";

const ToggleRow = ({
  icon,
  label,
  code,
  description,
  checked,
  disabled,
  busy,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  code: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4 py-3">
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{label}</span>
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded border">/!{code}</code>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
    <div className="shrink-0 flex items-center gap-2">
      {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      <Switch checked={checked} disabled={disabled || busy} onCheckedChange={onChange} />
    </div>
  </div>
);

const Connectors = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, loading, connecting, busyTool, connect, disconnect, toggle } = useConnectors();

  useEffect(() => {
    const result = searchParams.get("connector");
    if (!result) return;
    if (result === "connected") {
      toast({ title: "Google connected", description: "You can now enable Gmail and Drive tools below." });
    } else {
      const message = searchParams.get("message");
      toast({ title: "Connection failed", description: message || "Something went wrong linking Google.", variant: "destructive" });
    }
    searchParams.delete("connector");
    searchParams.delete("message");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleToggle = (tool: ConnectorTool, enabled: boolean) => {
    toggle(tool, enabled).catch((e) =>
      toast({ title: "Couldn't update connector", description: e.message, variant: "destructive" })
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="container max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/addons")}>
            Addons
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <Plug className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Connectors</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Link your Google account so the AI can read your Gmail, send email on your behalf, or search your
          Google Drive when you ask it to. Your sign-in is saved to your account — you only connect once, then
          switch individual tools on or off any time.
        </p>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                </div>
                <div>
                  <p className="font-medium">Google Account</p>
                  <p className="text-sm text-muted-foreground">
                    {status.connected ? status.googleEmail || "Connected" : "Not connected"}
                  </p>
                </div>
                {status.connected && (
                  <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</Badge>
                )}
              </div>
              {status.connected ? (
                <Button variant="outline" size="sm" disabled={connecting} onClick={() => {
                  if (!confirm("Disconnect your Google account? This turns off Gmail and Drive tools.")) return;
                  disconnect().catch((e) => toast({ title: "Disconnect failed", description: e.message, variant: "destructive" }));
                }}>
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
                </Button>
              ) : (
                <Button size="sm" disabled={connecting} onClick={() => connect().catch((e) => toast({ title: "Couldn't start sign-in", description: e.message, variant: "destructive" }))}>
                  {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Sign in with Google
                </Button>
              )}
            </div>

            <div className="divide-y mt-2">
              <ToggleRow
                icon={<Mail className="w-4 h-4" />}
                label="Gmail — Read"
                code="gmail:read"
                description="Let the AI search and read messages in your inbox."
                checked={status.gmailReadEnabled}
                disabled={!status.connected}
                busy={busyTool === "gmail:read"}
                onChange={(v) => handleToggle("gmail:read", v)}
              />
              <ToggleRow
                icon={<Mail className="w-4 h-4" />}
                label="Gmail — Write"
                code="gmail:write"
                description="Let the AI send emails from your account when you ask it to."
                checked={status.gmailWriteEnabled}
                disabled={!status.connected}
                busy={busyTool === "gmail:write"}
                onChange={(v) => handleToggle("gmail:write", v)}
              />
              <ToggleRow
                icon={<HardDrive className="w-4 h-4" />}
                label="Google Drive — Read"
                code="drive:read"
                description="Let the AI search your Drive and read file contents."
                checked={status.driveReadEnabled}
                disabled={!status.connected}
                busy={busyTool === "drive:read"}
                onChange={(v) => handleToggle("drive:read", v)}
              />
            </div>
          </Card>
        )}

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="setup-guide">
            <AccordionTrigger className="text-base font-semibold">
              Server setup: enabling Google sign-in (Google Cloud Console)
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-4">
                This is a one-time setup the site owner does before "Sign in with Google" will work.
                It creates the OAuth credentials the app uses to ask users for Gmail/Drive permission.
              </p>
              <ol className="space-y-4 text-sm">
                <li>
                  <p className="font-medium">1. Create (or choose) a Google Cloud project</p>
                  <p className="text-muted-foreground">
                    Go to{" "}
                    <a className="text-primary underline inline-flex items-center gap-1" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                      console.cloud.google.com <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    and create a new project (or reuse an existing one, e.g. one you already made in Firebase — a
                    Firebase project is just a Google Cloud project, so you can pick it from the project dropdown too).
                  </p>
                </li>
                <li>
                  <p className="font-medium">2. Enable the Gmail and Drive APIs</p>
                  <p className="text-muted-foreground">
                    In the left menu go to <strong>APIs &amp; Services → Library</strong>. Search for and enable{" "}
                    <strong>Gmail API</strong> and <strong>Google Drive API</strong>.
                  </p>
                </li>
                <li>
                  <p className="font-medium">3. Configure the OAuth consent screen</p>
                  <p className="text-muted-foreground">
                    Go to <strong>APIs &amp; Services → OAuth consent screen</strong>. Choose <strong>External</strong>{" "}
                    (unless everyone using this site is in your Google Workspace org, then use Internal), fill in
                    the app name, support email, and your site's domain. Under <strong>Scopes</strong>, add:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                    <li><code className="font-mono">.../auth/gmail.readonly</code></li>
                    <li><code className="font-mono">.../auth/gmail.send</code></li>
                    <li><code className="font-mono">.../auth/drive.readonly</code></li>
                  </ul>
                  <p className="text-muted-foreground mt-1">
                    Since gmail/drive scopes are "sensitive", Google will require the app to eventually pass
                    verification before it can go out of testing mode. While testing, add your own Google account
                    (and any other testers) under <strong>Test users</strong> so you can try it immediately.
                  </p>
                </li>
                <li>
                  <p className="font-medium">4. Create an OAuth Client ID</p>
                  <p className="text-muted-foreground">
                    Go to <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth client ID</strong>.
                    Application type: <strong>Web application</strong>. Under <strong>Authorized redirect URIs</strong>, add:
                  </p>
                  <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded border mt-1 break-all">
                    https://&lt;YOUR-SUPABASE-PROJECT-REF&gt;.supabase.co/functions/v1/google-oauth-callback
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Click Create — Google will show you a <strong>Client ID</strong> and <strong>Client secret</strong>. Copy both.
                  </p>
                </li>
                <li>
                  <p className="font-medium">5. Add the credentials to Supabase</p>
                  <p className="text-muted-foreground">
                    In the Supabase dashboard, go to <strong>Project Settings → Edge Functions → Secrets</strong>{" "}
                    (or run <code className="font-mono">supabase secrets set</code> from the CLI) and add:
                  </p>
                  <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded border mt-1">
                    GOOGLE_CLIENT_ID=your-client-id<br />
                    GOOGLE_CLIENT_SECRET=your-client-secret
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Redeploy the <code className="font-mono">google-oauth-start</code>,{" "}
                    <code className="font-mono">google-oauth-callback</code> and <code className="font-mono">chat</code>{" "}
                    functions after adding secrets so they pick up the new values.
                  </p>
                </li>
                <li>
                  <p className="font-medium">6. Publish when you're ready</p>
                  <p className="text-muted-foreground">
                    While the consent screen is in <strong>Testing</strong>, only the test users you listed can sign in.
                    When you're ready for anyone to connect, submit the app for verification from the OAuth consent
                    screen page and publish it to <strong>Production</strong>.
                  </p>
                </li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4">
                That's it — once the secrets are set, the "Sign in with Google" button above will open Google's
                consent screen, ask for Gmail/Drive permission, and save the result to the signed-in user's account.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Connectors;
