import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Puzzle, Settings as SettingsIcon } from "lucide-react";
import { useMods } from "@/hooks/useMods";

const Settings = () => {
  const navigate = useNavigate();
  const { has, settings, updateSettings, loading } = useMods();
  const fontSize = settings.fontSize ?? 16;
  const colors = settings.creditColors ?? {};

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="container max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/mods")}>
            <Puzzle className="w-4 h-4 mr-2" /> Mods
          </Button>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {!has("text-size") && !has("credit-recolor") && !has("copy") && (
              <p className="text-muted-foreground text-sm">
                You haven't installed any mods yet. Visit <button className="underline text-primary" onClick={() => navigate("/mods")}>Mods</button> to install some.
              </p>
            )}

            {has("text-size") && (
              <Card className="p-4 space-y-3">
                <div>
                  <div className="font-semibold">Text Size</div>
                  <div className="text-sm text-muted-foreground">Change the base font size of the website ({fontSize}px).</div>
                </div>
                <Slider
                  min={12}
                  max={24}
                  step={1}
                  value={[fontSize]}
                  onValueChange={(v) => updateSettings({ fontSize: v[0] })}
                />
                <Button size="sm" variant="outline" onClick={() => updateSettings({ fontSize: 16 })}>
                  Reset to default
                </Button>
              </Card>
            )}

            {has("credit-recolor") && (
              <Card className="p-4 space-y-3">
                <div>
                  <div className="font-semibold">Credit Colors</div>
                  <div className="text-sm text-muted-foreground">Recolor your credit pills.</div>
                </div>
                {(["audio", "image", "video"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <Label className="capitalize">{k} credits</Label>
                    <input
                      type="color"
                      value={(colors as any)[k] || (k === "audio" ? "#fdba74" : k === "image" ? "#d8b4fe" : "#7dd3fc")}
                      onChange={(e) => updateSettings({ creditColors: { ...colors, [k]: e.target.value } })}
                      className="h-10 w-16 rounded cursor-pointer bg-transparent border border-border"
                    />
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => updateSettings({ creditColors: {} })}>
                  Reset colors
                </Button>
              </Card>
            )}

            {has("copy") && (
              <Card className="p-4">
                <div className="font-semibold">Copy</div>
                <div className="text-sm text-muted-foreground">
                  Copy buttons are now shown on every message. No settings.
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;