import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Settings as SettingsIcon, Puzzle } from "lucide-react";
import { ALL_MODS, useMods } from "@/hooks/useMods";

const Mods = () => {
  const navigate = useNavigate();
  const { installed, toggleMod, loading } = useMods();

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="container max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/settings")}>
            <SettingsIcon className="w-4 h-4 mr-2" /> Settings
          </Button>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <Puzzle className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Mods</h1>
        </div>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {ALL_MODS.map((m) => {
              const on = installed.includes(m.id);
              return (
                <Card key={m.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-muted-foreground">{m.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{on ? "Installed" : "Not installed"}</span>
                    <Switch checked={on} onCheckedChange={() => toggleMod(m.id)} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Mods;