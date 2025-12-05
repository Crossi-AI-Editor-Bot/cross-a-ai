import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Power, PowerOff, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useModelCosts } from "@/hooks/useModelCosts";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { modelCosts, loading: costsLoading } = useModelCosts();
  const { isDisabled, disabledUntil, disableSite, enableSite, loading: siteLoading } = useSiteStatus();
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [vipOnly, setVipOnly] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [togglingSite, setTogglingSite] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    const initialCosts: Record<string, number> = {};
    const initialLabels: Record<string, string> = {};
    const initialEnabled: Record<string, boolean> = {};
    const initialVipOnly: Record<string, boolean> = {};
    modelCosts.forEach((model) => {
      initialCosts[model.model_id] = model.cost;
      initialLabels[model.model_id] = model.label;
      initialEnabled[model.model_id] = model.enabled;
      initialVipOnly[model.model_id] = model.vip_only;
    });
    setCosts(initialCosts);
    setLabels(initialLabels);
    setEnabled(initialEnabled);
    setVipOnly(initialVipOnly);
  }, [modelCosts]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(costs).map(([model_id, cost]) => ({
        model_id,
        cost,
        label: labels[model_id],
        enabled: enabled[model_id],
        vip_only: vipOnly[model_id],
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("model_costs")
          .update({ 
            cost: update.cost, 
            label: update.label,
            enabled: update.enabled,
            vip_only: update.vip_only
          })
          .eq("model_id", update.model_id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Model settings updated successfully",
      });
    } catch (error) {
      console.error("Error updating model settings:", error);
      toast({
        title: "Error",
        description: "Failed to update model settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSite = async () => {
    setTogglingSite(true);
    try {
      if (isDisabled) {
        const success = await enableSite();
        if (success) {
          toast({ title: "Site enabled", description: "The site is now accessible to all users." });
        }
      } else {
        const success = await disableSite(1);
        if (success) {
          toast({ title: "Site disabled", description: "The site is now disabled for 1 day." });
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to toggle site status", variant: "destructive" });
    } finally {
      setTogglingSite(false);
    }
  };

  if (adminLoading || costsLoading || siteLoading) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="container max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Chat
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground">Manage AI model costs</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Site Control</CardTitle>
            <CardDescription>
              Enable or disable the site for all users. When disabled, users will see a maintenance page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Site Status</p>
                <p className="text-sm text-muted-foreground">
                  {isDisabled 
                    ? `Disabled until ${disabledUntil?.toLocaleString()}`
                    : "Site is currently online"}
                </p>
              </div>
              <Button 
                onClick={handleToggleSite} 
                disabled={togglingSite}
                variant={isDisabled ? "default" : "destructive"}
              >
                {isDisabled ? (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Enable Site
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" />
                    Disable for 1 Day
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Costs Configuration</CardTitle>
            <CardDescription>
              Adjust the credit cost for each AI model. Changes will apply immediately to all users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modelCosts.map((model) => (
              <div key={model.id} className="space-y-3 pb-4 border-b last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label htmlFor={`label-${model.model_id}`}>Display Name</Label>
                    <p className="text-sm text-muted-foreground">{model.model_id}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`enabled-${model.model_id}`}
                        checked={enabled[model.model_id] ?? true}
                        onCheckedChange={(checked) =>
                          setEnabled((prev) => ({
                            ...prev,
                            [model.model_id]: checked,
                          }))
                        }
                      />
                      <Label htmlFor={`enabled-${model.model_id}`} className="text-sm">
                        Enabled
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`vip-${model.model_id}`}
                        checked={vipOnly[model.model_id] ?? false}
                        onCheckedChange={(checked) =>
                          setVipOnly((prev) => ({
                            ...prev,
                            [model.model_id]: checked,
                          }))
                        }
                      />
                      <Label htmlFor={`vip-${model.model_id}`} className="text-sm flex items-center gap-1">
                        <Crown className="w-3 h-3 text-yellow-500" />
                        VIP Only
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input
                      id={`label-${model.model_id}`}
                      type="text"
                      value={labels[model.model_id] || ""}
                      onChange={(e) =>
                        setLabels((prev) => ({
                          ...prev,
                          [model.model_id]: e.target.value,
                        }))
                      }
                      placeholder="Model display name"
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      id={`cost-${model.model_id}`}
                      type="number"
                      step="0.1"
                      min="0"
                      value={costs[model.model_id] || 0}
                      onChange={(e) =>
                        setCosts((prev) => ({
                          ...prev,
                          [model.model_id]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">credits</span>
                </div>
              </div>
            ))}

            <div className="pt-4">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
