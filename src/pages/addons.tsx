import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Blocks,
  Upload,
  Trash2,
  Loader2,
  Terminal,
  User,
  Download,
} from "lucide-react";
import { useAddons, type Addon } from "@/hooks/useAddons";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "@/hooks/use-toast";

const ToolBadgeList = ({ addon }: { addon: Addon }) => (
  <div className="space-y-2">
    {addon.tools.length === 0 ? (
      <p className="text-sm text-muted-foreground">This addon doesn't register any tools.</p>
    ) : (
      addon.tools.map((tool) => (
        <div key={tool.name} className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded border">
              /!{addon.prefix}:{tool.name}
              {(tool.parameters ?? []).map((p) => ` <${p.name}${p.required === false ? "?" : ""}>`).join("")}
            </code>
          </div>
          {tool.description && <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>}
        </div>
      ))
    )}
  </div>
);

const AddonCard = ({
  addon,
  installed,
  canDelete,
  busy,
  onInstall,
  onUninstall,
  onDelete,
}: {
  addon: Addon;
  installed: boolean;
  canDelete: boolean;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onDelete: () => void;
}) => {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{addon.name}</h3>
            {addon.version && <Badge variant="outline">v{addon.version}</Badge>}
            <Badge variant="secondary" className="font-mono">/!{addon.prefix}:…</Badge>
          </div>
          {addon.description && <p className="text-sm text-muted-foreground mt-1">{addon.description}</p>}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{addon.author_name || "unknown"}</span>
            <span className="flex items-center gap-1"><Terminal className="w-3 h-3" />{addon.tools.length} tool{addon.tools.length === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-1"><Download className="w-3 h-3" />{addon.install_count} install{addon.install_count === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {installed ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={onUninstall}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Uninstall"}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={onInstall}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Install"}
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <Accordion type="single" collapsible className="mt-3">
        <AccordionItem value="tools" className="border-none">
          <AccordionTrigger className="text-sm py-2 hover:no-underline">
            View tools & usage
          </AccordionTrigger>
          <AccordionContent>
            <ToolBadgeList addon={addon} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
};

const Addons = () => {
  const navigate = useNavigate();
  const { addons, installedIds, loading, busyId, uploading, install, uninstall, remove, upload } = useAddons();
  const { isAdmin } = useIsAdmin();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...addons].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [addons],
  );

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".caiaddon")) {
      toast({ title: "Invalid file", description: "Addons must be a .caiaddon file.", variant: "destructive" });
      return;
    }
    try {
      const result: any = await upload(file);
      toast({ title: "Addon uploaded", description: `${result?.addon?.name ?? file.name} is now installed.` });
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="container max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/mods")}>
            Mods
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Blocks className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Addons</h1>
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept=".caiaddon" className="hidden" onChange={handleFileChosen} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload .caiaddon
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Addons give the AI new tools. Anyone can upload a <code className="font-mono">.caiaddon</code> package
          (a renamed .zip containing <code className="font-mono">addon.json</code>, an optional{" "}
          <code className="font-mono">tools.json</code>, and <code className="font-mono">tools/*.py</code> scripts).
          Installed addon tools are called by the AI as <code className="font-mono">/!prefix:toolname</code>.
        </p>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No addons yet. Be the first to upload one!
          </Card>
        ) : (
          <div className="space-y-3">
            {sorted.map((addon) => (
              <AddonCard
                key={addon.id}
                addon={addon}
                installed={installedIds.includes(addon.id)}
                canDelete={isAdmin || false}
                busy={busyId === addon.id}
                onInstall={() => install(addon.id).catch((e) => toast({ title: "Install failed", description: e.message, variant: "destructive" }))}
                onUninstall={() => uninstall(addon.id).catch((e) => toast({ title: "Uninstall failed", description: e.message, variant: "destructive" }))}
                onDelete={() => {
                  if (!confirm(`Delete addon "${addon.name}" for everyone? This cannot be undone.`)) return;
                  remove(addon.id).catch((e) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Addons;
