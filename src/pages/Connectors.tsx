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
import { ArrowLeft, Plug, Github, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
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
      toast({ title: "GitHub connected", description: "You can now enable read and write tools below." });
    } else {
      const message = searchParams.get("message");
      toast({ title: "Connection failed", description: message || "Something went wrong linking GitHub.", variant: "destructive" });
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
          Connect your GitHub account so the AI can read your repos, open issues, or commit files when you ask
          it to. Your sign-in is saved to your account — you only connect once, then switch individual tools
          on or off any time.
        </p>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium">GitHub Account</p>
                  <p className="text-sm text-muted-foreground">
                    {status.connected ? (status.accountLogin ? `@${status.accountLogin}` : "Connected") : "Not connected"}
                  </p>
                </div>
                {status.connected && (
                  <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</Badge>
                )}
              </div>
              {status.connected ? (
                <Button variant="outline" size="sm" disabled={connecting} onClick={() => {
                  if (!confirm("Disconnect your GitHub account? This turns off read and write tools.")) return;
                  disconnect().catch((e) => toast({ title: "Disconnect failed", description: e.message, variant: "destructive" }));
                }}>
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
                </Button>
              ) : (
                <Button size="sm" disabled={connecting} onClick={() => connect().catch((e) => toast({ title: "Couldn't start sign-in", description: e.message, variant: "destructive" }))}>
                  {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Github className="w-4 h-4 mr-2" />}
                  Connect GitHub
                </Button>
              )}
            </div>

            <div className="divide-y mt-2">
              <ToggleRow
                icon={<Github className="w-4 h-4" />}
                label="GitHub — Read"
                code="github:read"
                description="Let the AI read files, list issues, and search code in your repos."
                checked={status.githubReadEnabled}
                disabled={!status.connected}
                busy={busyTool === "github:read"}
                onChange={(v) => handleToggle("github:read", v)}
              />
              <ToggleRow
                icon={<Github className="w-4 h-4" />}
                label="GitHub — Write"
                code="github:write"
                description="Let the AI open issues, add comments, and commit file changes when you ask it to."
                checked={status.githubWriteEnabled}
                disabled={!status.connected}
                busy={busyTool === "github:write"}
                onChange={(v) => handleToggle("github:write", v)}
              />
            </div>
          </Card>
        )}

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="setup-guide">
            <AccordionTrigger className="text-base font-semibold">
              Server setup: creating the GitHub App
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-4">
                This is a one-time setup the site owner does before "Connect GitHub" will work. It's simpler
                than Google Cloud — no separate API library, consent screen review, or verification process.
              </p>
              <ol className="space-y-4 text-sm">
                <li>
                  <p className="font-medium">1. Create a GitHub App</p>
                  <p className="text-muted-foreground">
                    Go to{" "}
                    <a className="text-primary underline inline-flex items-center gap-1" href="https://github.com/settings/apps/new" target="_blank" rel="noreferrer">
                      github.com/settings/apps/new <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    (or under your GitHub organization's Settings → Developer settings → GitHub Apps, if you
                    want the app owned by an org instead of your personal account).
                  </p>
                </li>
                <li>
                  <p className="font-medium">2. Fill in the basics</p>
                  <p className="text-muted-foreground">
                    Give it a name (e.g. "MyChat Connector") and a homepage URL (your site's URL). Under{" "}
                    <strong>Callback URL</strong>, enter:
                  </p>
                  <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded border mt-1 break-all">
                    https://&lt;YOUR-SUPABASE-PROJECT-REF&gt;.supabase.co/functions/v1/github-oauth-callback
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Check <strong>"Request user authorization (OAuth) during installation"</strong> — this is what
                    lets a user click one button to both install the app and sign in.
                  </p>
                </li>
                <li>
                  <p className="font-medium">3. Set permissions</p>
                  <p className="text-muted-foreground">
                    Under <strong>Repository permissions</strong>, set:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                    <li><strong>Contents</strong>: Read and write (needed for reading/writing files)</li>
                    <li><strong>Issues</strong>: Read and write (needed for reading/creating issues and comments)</li>
                    <li><strong>Metadata</strong>: Read-only (required automatically)</li>
                  </ul>
                  <p className="text-muted-foreground mt-1">
                    Under <strong>Where can this GitHub App be installed?</strong>, choose "Any account" so any
                    of your users can install it on their own account or org.
                  </p>
                </li>
                <li>
                  <p className="font-medium">4. Create the app and get credentials</p>
                  <p className="text-muted-foreground">
                    Click <strong>Create GitHub App</strong>. On the app's page, note the <strong>Client ID</strong>,
                    then click <strong>Generate a new client secret</strong> and copy it (you won't see it again).
                  </p>
                </li>
                <li>
                  <p className="font-medium">5. Add the credentials to Supabase</p>
                  <p className="text-muted-foreground">
                    In the Supabase dashboard, go to <strong>Project Settings → Edge Functions → Secrets</strong>{" "}
                    (or run <code className="font-mono">supabase secrets set</code> from the CLI) and add:
                  </p>
                  <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded border mt-1">
                    GITHUB_APP_CLIENT_ID=your-client-id<br />
                    GITHUB_APP_CLIENT_SECRET=your-client-secret
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Redeploy the <code className="font-mono">github-oauth-start</code>,{" "}
                    <code className="font-mono">github-oauth-callback</code> and <code className="font-mono">chat</code>{" "}
                    functions after adding secrets so they pick up the new values.
                  </p>
                </li>
                <li>
                  <p className="font-medium">6. That's it — no review needed</p>
                  <p className="text-muted-foreground">
                    Unlike Google's sensitive-scope verification, a GitHub App works immediately for any account
                    that installs it — there's no waiting period. Users just click "Connect GitHub" above, pick
                    which repos to grant access to, and they're done.
                  </p>
                </li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4">
                Once the secrets are set, the "Connect GitHub" button above will open GitHub's install/authorize
                screen and save the result to the signed-in user's account.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Connectors;
