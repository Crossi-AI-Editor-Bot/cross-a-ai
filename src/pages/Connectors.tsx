import { useEffect, useMemo } from "react";
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
import { useConnectors, type CatalogAction, type ConnectorScope } from "@/hooks/useConnectors";
import { toast } from "@/hooks/use-toast";

const ActionRow = ({
  action,
  checked,
  disabled,
  busy,
  onChange,
}: {
  action: CatalogAction;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm">{action.label}</span>
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded border">/!github:{action.name}</code>
      </div>
    </div>
    <div className="shrink-0 flex items-center gap-2">
      {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      <Switch checked={checked} disabled={disabled || busy} onCheckedChange={onChange} />
    </div>
  </div>
);

const ScopeSection = ({
  title,
  description,
  actions,
  enabledSet,
  disabled,
  busyTool,
  busyScope,
  scope,
  onToggle,
  onToggleAll,
}: {
  title: string;
  description: string;
  actions: CatalogAction[];
  enabledSet: Set<string>;
  disabled: boolean;
  busyTool: string | null;
  busyScope: ConnectorScope | null;
  scope: ConnectorScope;
  onToggle: (name: string, enabled: boolean) => void;
  onToggleAll: (scope: ConnectorScope, enabled: boolean) => void;
}) => {
  const allEnabled = actions.length > 0 && actions.every((a) => enabledSet.has(a.name));
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          size="sm"
          variant={allEnabled ? "outline" : "secondary"}
          disabled={disabled || busyScope === scope}
          onClick={() => onToggleAll(scope, !allEnabled)}
        >
          {busyScope === scope ? <Loader2 className="w-4 h-4 animate-spin" /> : allEnabled ? "Disable all" : "Enable all"}
        </Button>
      </div>
      <div className="divide-y mt-2">
        {actions.map((a) => (
          <ActionRow
            key={a.name}
            action={a}
            checked={enabledSet.has(a.name)}
            disabled={disabled}
            busy={busyTool === a.name}
            onChange={(v) => onToggle(a.name, v)}
          />
        ))}
      </div>
    </Card>
  );
};

const Connectors = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, loading, connecting, busyTool, busyScope, connect, disconnect, toggle, toggleAll } = useConnectors();

  useEffect(() => {
    const result = searchParams.get("connector");
    if (!result) return;
    if (result === "connected") {
      toast({ title: "GitHub connected", description: "Enable the actions you want the AI to use below." });
    } else {
      const message = searchParams.get("message");
      toast({ title: "Connection failed", description: message || "Something went wrong linking GitHub.", variant: "destructive" });
    }
    searchParams.delete("connector");
    searchParams.delete("message");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const enabledSet = useMemo(() => new Set(status.enabledActions), [status.enabledActions]);
  const allActionsCount = status.catalog.repo.length + status.catalog.account.length;
  const allEnabled = allActionsCount > 0 && status.enabledActions.length === allActionsCount;

  const handleToggle = (tool: string, enabled: boolean) => {
    toggle(tool, enabled).catch((e) => toast({ title: "Couldn't update connector", description: e.message, variant: "destructive" }));
  };
  const handleToggleAll = (scope: ConnectorScope, enabled: boolean) => {
    toggleAll(scope, enabled).catch((e) => toast({ title: "Couldn't update connector", description: e.message, variant: "destructive" }));
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
          Connect your GitHub account so the AI can act on your repos and account when you ask it to. Your
          sign-in is saved to your account — you only connect once, then switch individual actions on or off
          any time.
        </p>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Card className="p-4 mb-4">
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
                <div className="flex items-center gap-2">
                  {status.connected && (
                    <Button
                      size="sm"
                      variant={allEnabled ? "outline" : "secondary"}
                      disabled={busyScope === "all"}
                      onClick={() => handleToggleAll("all", !allEnabled)}
                    >
                      {busyScope === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : allEnabled ? "Disable all" : "Enable all"}
                    </Button>
                  )}
                  {status.connected ? (
                    <Button variant="outline" size="sm" disabled={connecting} onClick={() => {
                      if (!confirm("Disconnect your GitHub account? This turns off every enabled action.")) return;
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
              </div>
            </Card>

            <div className="space-y-4 mb-6">
              <ScopeSection
                title="Repository actions"
                description="Need an owner/repo argument, e.g. /!github:commit acme/site ..."
                actions={status.catalog.repo}
                enabledSet={enabledSet}
                disabled={!status.connected}
                busyTool={busyTool}
                busyScope={busyScope}
                scope="repo"
                onToggle={handleToggle}
                onToggleAll={handleToggleAll}
              />
              <ScopeSection
                title="Account actions"
                description="Act on the signed-in GitHub account directly, no repo needed."
                actions={status.catalog.account}
                enabledSet={enabledSet}
                disabled={!status.connected}
                busyTool={busyTool}
                busyScope={busyScope}
                scope="account"
                onToggle={handleToggle}
                onToggleAll={handleToggleAll}
              />
            </div>
          </>
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
                    (or under your GitHub organization's Settings → Developer settings → GitHub Apps).
                  </p>
                </li>
                <li>
                  <p className="font-medium">2. Fill in the basics</p>
                  <p className="text-muted-foreground">
                    Give it a name and homepage URL (your site's URL). Under <strong>Callback URL</strong>, enter:
                  </p>
                  <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded border mt-1 break-all">
                    https://&lt;YOUR-SUPABASE-PROJECT-REF&gt;.supabase.co/functions/v1/github-oauth-callback
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Check <strong>"Request user authorization (OAuth) during installation"</strong> — this lets a
                    user click one button to both install the app and sign in.
                  </p>
                </li>
                <li>
                  <p className="font-medium">3. Set permissions</p>
                  <p className="text-muted-foreground">
                    Grant whatever permissions you want to expose as actions below — each toggle on this page maps
                    to one GitHub permission. At minimum for the actions built in here: <strong>Contents</strong>{" "}
                    (read/write), <strong>Issues</strong> (read/write), <strong>Metadata</strong> (read-only,
                    required automatically). Add more (Actions, Administration, Checks, Pull requests, etc.) to
                    unlock the matching toggles.
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Under <strong>Where can this GitHub App be installed?</strong>, choose "Any account" so any
                    of your users can install it on their own account or org.
                  </p>
                </li>
                <li>
                  <p className="font-medium">4. Create the app and get credentials</p>
                  <p className="text-muted-foreground">
                    Click <strong>Create GitHub App</strong>. Note the <strong>Client ID</strong>, then click{" "}
                    <strong>Generate a new client secret</strong> and copy it (you won't see it again).
                  </p>
                </li>
                <li>
                  <p className="font-medium">5. Add the credentials to Supabase</p>
                  <p className="text-muted-foreground">
                    In the Supabase dashboard, go to <strong>Project Settings → Edge Functions → Secrets</strong>{" "}
                    and add:
                  </p>
                  <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded border mt-1">
                    GITHUB_APP_CLIENT_ID=your-client-id<br />
                    GITHUB_APP_CLIENT_SECRET=your-client-secret<br />
                    SITE_URL=https://your-lovable-site.lovable.app
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Redeploy <code className="font-mono">github-oauth-start</code>,{" "}
                    <code className="font-mono">github-oauth-callback</code>, <code className="font-mono">connectors-manage</code> and{" "}
                    <code className="font-mono">chat</code> after adding secrets.
                  </p>
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Connectors;
