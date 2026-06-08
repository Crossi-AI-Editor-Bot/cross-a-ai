import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, MessageSquare, Mic, Image as ImageIcon, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Kind = "text" | "audio" | "image" | "video";

const OPTIONS: { kind: Kind; label: string; per10: number; icon: any; color: string }[] = [
  { kind: "text", label: "Text Credits", per10: 2, icon: MessageSquare, color: "text-blue-500" },
  { kind: "audio", label: "Audio Credits", per10: 5, icon: Mic, color: "text-green-500" },
  { kind: "image", label: "Image Credits", per10: 15, icon: ImageIcon, color: "text-purple-500" },
  { kind: "video", label: "Video Credits", per10: 200, icon: Video, color: "text-red-500" },
];

interface Props {
  croinBalance: number | null;
  refetchCroins: () => Promise<void> | void;
}

const CreditPurchaseSection = ({ croinBalance, refetchCroins }: Props) => {
  const { toast } = useToast();
  const [amounts, setAmounts] = useState<Record<Kind, number>>({ text: 10, audio: 10, image: 10, video: 10 });
  const [loading, setLoading] = useState<Kind | null>(null);

  const handleBuy = async (kind: Kind, per10: number) => {
    const amount = amounts[kind];
    if (!amount || amount < 10 || amount % 10 !== 0) {
      toast({ title: "Invalid amount", description: "Amount must be a multiple of 10 (min 10).", variant: "destructive" });
      return;
    }
    const cost = (amount / 10) * per10;
    if (croinBalance !== null && croinBalance < cost) {
      toast({ title: "Not enough Croins", description: `You need ¢${cost}.`, variant: "destructive" });
      return;
    }
    setLoading(kind);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-credits", {
        body: { kind, amount },
      });
      if (error || data?.error) {
        toast({ title: "Purchase failed", description: data?.error || "Try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Credits added! 🎉", description: `+${amount} ${kind} credits for ¢${cost}.` });
      await refetchCroins();
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast({ title: "Error", description: "Purchase failed.", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-yellow-500" />
          Buy Credits
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {OPTIONS.map(({ kind, label, per10, icon: Icon, color }) => {
          const amount = amounts[kind];
          const cost = Math.max(10, amount || 10) / 10 * per10;
          return (
            <div key={kind} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${color}`} />
                <h4 className="font-semibold">{label}</h4>
              </div>
              <p className="text-xs text-muted-foreground">¢{per10} per 10 credits</p>
              <div className="space-y-1">
                <Label htmlFor={`amt-${kind}`} className="text-xs">Amount (multiples of 10)</Label>
                <Input
                  id={`amt-${kind}`}
                  type="number"
                  min={10}
                  step={10}
                  value={amount}
                  onChange={(e) => setAmounts((p) => ({ ...p, [kind]: Math.max(10, parseInt(e.target.value) || 10) }))}
                />
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={() => handleBuy(kind, per10)}
                disabled={loading === kind}
              >
                <Coins className="w-4 h-4 mr-1" />
                {loading === kind ? "Buying..." : `Buy for ¢${cost}`}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default CreditPurchaseSection;