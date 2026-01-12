import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, X, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { VipTierIcon, VipTierBadge, type VipTierType } from "@/components/VipTierIcon";
import { useVipStatus, getRequiredTierFor, getNextTier } from "@/hooks/useVipStatus";
import { useVipRequests } from "@/hooks/useVipRequests";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import VipAdminRequests from "@/components/VipAdminRequests";

const tierBenefits: Record<VipTierType, string[]> = {
  copper: [
    "16 daily credits (vs 15 free)",
    "Access to Copper-tier models",
    "Basic priority support",
  ],
  bronze: [
    "18 daily credits",
    "Access to Bronze-tier models",
    "All Copper benefits",
    "Priority support",
  ],
  silver: [
    "20 daily credits",
    "Access to Silver-tier models",
    "All Bronze benefits",
    "Extended chat history",
  ],
  gold: [
    "22 daily credits",
    "Access to Gold-tier models",
    "All Silver benefits",
    "Early access to new features",
  ],
  platinum: [
    "24 daily credits",
    "Access to Platinum-tier models",
    "All Gold benefits",
    "Exclusive Platinum features",
  ],
  emerald: [
    "28 daily credits",
    "All Platinum Benefits"
  ]
  diamond: [
    "30 daily credits",
    "Access to ALL models",
    "All Platinum benefits",
    "Exclusive Diamond features",
    "Direct admin support",
  ],
};

const tierDescriptions: Record<VipTierType, string> = {
  copper: "Entry level VIP",
  bronze: "Requires Copper",
  silver: "Requires Bronze",
  gold: "Requires Silver",
  platinum: "Requires Gold",
  emerald: "Requires Platinum"
  diamond: "Requires Emerald",
};

const VipShop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tier: currentTier, loading: vipLoading, hasTierAccess } = useVipStatus();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { userRequests, createRequest, loading: requestsLoading } = useVipRequests(isAdmin);
  const [requestingTier, setRequestingTier] = useState<VipTierType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<VipTierType | null>(null);
  const [requestMessage, setRequestMessage] = useState("");

  const tiers: VipTierType[] = ['copper', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];

  const pendingRequest = userRequests.find(r => r.status === 'pending');

  const canRequestTier = (tier: VipTierType): boolean => {
    const requiredTier = getRequiredTierFor(tier);
    if (!requiredTier) return true; // copper has no requirement
    return hasTierAccess(requiredTier);
  };

  const openRequestDialog = (tier: VipTierType) => {
    setSelectedTier(tier);
    setRequestMessage("");
    setDialogOpen(true);
  };

  const handleRequestTier = async () => {
    if (!selectedTier) return;

    if (pendingRequest) {
      toast({
        title: "Request pending",
        description: "You already have a pending VIP request. Please wait for admin review.",
        variant: "destructive",
      });
      setDialogOpen(false);
      return;
    }

    setRequestingTier(selectedTier);
    const result = await createRequest(selectedTier, requestMessage);
    setRequestingTier(null);
    setDialogOpen(false);

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Request submitted!",
        description: "Your VIP request has been sent to the admin for review.",
      });
    }
  };

  const getRequestStatus = (tier: VipTierType) => {
    const request = userRequests.find(r => r.requested_tier === tier);
    if (!request) return null;
    return request.status;
  };

  if (vipLoading || adminLoading || requestsLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                <h1 className="text-xl font-bold">VIP Shop</h1>
              </div>
            </div>
            {currentTier && (
              <VipTierBadge tier={currentTier} />
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-8">
        {/* Upgrade Path Info */}
        <Card className="mb-8 bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Upgrade Path</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {tiers.map((tier, i) => (
                  <div key={tier} className="flex items-center gap-2">
                    <span className={`capitalize text-sm font-medium ${currentTier === tier ? 'text-primary' : 'text-muted-foreground'}`}>
                      {tier}
                    </span>
                    {i < tiers.length - 1 && <span className="text-muted-foreground">→</span>}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Status */}
        {pendingRequest && (
          <Card className="mb-8 border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="font-medium">Pending Request</p>
                  <p className="text-sm text-muted-foreground">
                    Your request for <span className="capitalize font-medium">{pendingRequest.requested_tier}</span> tier is awaiting admin approval.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {tiers.map((tier) => {
            const isCurrentTier = currentTier === tier;
            const status = getRequestStatus(tier);
            const isPending = status === 'pending';
            const isDeclined = status === 'declined';
            const canRequest = canRequestTier(tier);
            const requiredTier = getRequiredTierFor(tier);
            const alreadyHas = hasTierAccess(tier);

            return (
              <Card 
                key={tier} 
                className={`relative transition-all hover:shadow-lg ${
                  isCurrentTier ? 'ring-2 ring-primary' : ''
                } ${!canRequest && !alreadyHas ? 'opacity-60' : ''}`}
              >
                {isCurrentTier && (
                  <Badge className="absolute -top-2 -right-2 bg-primary">
                    Current
                  </Badge>
                )}
                {!canRequest && !alreadyHas && (
                  <Badge variant="secondary" className="absolute -top-2 -right-2">
                    <Lock className="w-3 h-3 mr-1" />
                    Locked
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <VipTierIcon tier={tier} size="xl" className="mx-auto mb-2" />
                  <CardTitle className="capitalize">{tier}</CardTitle>
                  <CardDescription>
                    {tierDescriptions[tier]}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {tierBenefits[tier].map((benefit, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  {alreadyHas ? (
                    <Button className="w-full" disabled>
                      {isCurrentTier ? 'Active' : 'Unlocked'}
                    </Button>
                  ) : !canRequest ? (
                    <Button className="w-full" variant="outline" disabled>
                      <Lock className="w-4 h-4 mr-2" />
                      Need {requiredTier}
                    </Button>
                  ) : isPending ? (
                    <Button className="w-full" variant="outline" disabled>
                      <Clock className="w-4 h-4 mr-2" />
                      Pending
                    </Button>
                  ) : isDeclined ? (
                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => openRequestDialog(tier)}
                      disabled={!!pendingRequest || requestingTier === tier}
                    >
                      {requestingTier === tier ? "Requesting..." : "Request Again"}
                    </Button>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => openRequestDialog(tier)}
                      disabled={!!pendingRequest || requestingTier === tier}
                    >
                      {requestingTier === tier ? "Requesting..." : "Request"}
                    </Button>
                  )}

                  {isDeclined && (
                    <p className="text-xs text-red-500 mt-2 text-center flex items-center justify-center gap-1">
                      <X className="w-3 h-3" />
                      Previous request declined
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Admin Section */}
        {isAdmin && <VipAdminRequests />}
      </main>

      {/* Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Request {selectedTier && <span className="capitalize">{selectedTier}</span>} VIP
            </DialogTitle>
            <DialogDescription>
              Tell us why you'd like to become a {selectedTier} VIP member.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Message (optional)</label>
              <Textarea
                placeholder="Why would you like VIP access? (optional)"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestTier} disabled={requestingTier !== null}>
              {requestingTier ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VipShop;