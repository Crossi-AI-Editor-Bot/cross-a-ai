import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Puzzle, Settings as SettingsIcon } from "lucide-react";
import { useMods, APP_STYLE_PRESETS, AppStylePreset } from "@/hooks/useMods";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Settings = () => {
  const navigate = useNavigate();
  const { has, settings, updateSettings, loading } = useMods();
  const fontSize = settings.fontSize ?? 16;
  const colors = settings.creditColors ?? {};
  const appStyle = settings.appStyle ?? { preset: "classic" as AppStylePreset };
  const hslToHex = (hsl: string): string => {
    // "220 80% 12%" -> #hex
    const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
    if (!m) return "#000000";
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const k = (n: number) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
  };
  const hexToHsl = (hex: string): string => {
    const m = hex.replace("#", "");
    const r = parseInt(m.substring(0, 2), 16) / 255;
    const g = parseInt(m.substring(2, 4), 16) / 255;
    const b = parseInt(m.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
      }
      h *= 60;
    }
    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

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

            {has("app-style") && (
              <Card className="p-4 space-y-3">
                <div>
                  <div className="font-semibold">App Style</div>
                  <div className="text-sm text-muted-foreground">Change the background and accent color of the entire app.</div>
                </div>
                <Select
                  value={appStyle.preset ?? "classic"}
                  onValueChange={(v) => updateSettings({ appStyle: { ...appStyle, preset: v as AppStylePreset } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="classic">Classic</SelectItem>
                    <SelectItem value="crossatrix">Modern Crossatrix Style</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {appStyle.preset === "custom" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Background</Label>
                      <input
                        type="color"
                        value={hslToHex(appStyle.bg || "220 25% 98%")}
                        onChange={(e) => updateSettings({ appStyle: { ...appStyle, preset: "custom", bg: hexToHsl(e.target.value) } })}
                        className="h-10 w-16 rounded cursor-pointer bg-transparent border border-border"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label>Accent</Label>
                      <input
                        type="color"
                        value={hslToHex(appStyle.accent || "200 95% 45%")}
                        onChange={(e) => updateSettings({ appStyle: { ...appStyle, preset: "custom", accent: hexToHsl(e.target.value) } })}
                        className="h-10 w-16 rounded cursor-pointer bg-transparent border border-border"
                      />
                    </div>
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={() => updateSettings({ appStyle: { preset: "classic" } })}>
                  Reset to Classic
                </Button>
              </Card>
            )}

            {has("like-dislike") && (
              <Card className="p-4">
                <div className="font-semibold">Like / Dislike</div>
                <div className="text-sm text-muted-foreground">
                  Thumbs up/down buttons appear on AI messages. Disliking regenerates the reply with a 50% credit discount.
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