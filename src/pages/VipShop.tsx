import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { VipTierIcon, VipTierBadge, type VipTierType } from "@/components/VipTierIcon";
import { useVipStatus } from "@/hooks/useVipStatus";
import { useVipRequests } from "@/hooks/useVipRequests";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import VipAdminRequests from "@/components/VipAdminRequests";

const tierBenefits: Record<VipTierType, string[]> = {
  bronze: [
    "18 daily credits (vs 15 free)",
    "Access to Bronze-tier models",
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
  diamond: [
    "25 daily credits",
    "Access to ALL models",
    "All Gold benefits",
    "Exclusive Diamond features",
    "Direct admin support",
  ],
};

const VipShop = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tier: currentTier, loading: vipLoading } = useVipStatus();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { userRequests, createRequest, loading: requestsLoading } = useVipRequests(isAdmin);
  const [requestingTier, setRequestingTier] = useState<VipTierType | null>(null);

  const tiers: VipTierType[] = ['bronze', 'silver', 'gold', 'diamond'];

  const pendingRequest = userRequests.find(r => r.status === 'pending');

  const handleRequestTier = async (tier: VipTierType) => {
    if (pendingRequest) {
      toast({
        title: "Request pending",
        description: "You already have a pending VIP request. Please wait for admin review.",
        variant: "destructive",
      });
      return;
    }

    setRequestingTier(tier);
    const result = await createRequest(tier);
    setRequestingTier(null);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {tiers.map((tier) => {
            const isCurrentTier = currentTier === tier;
            const status = getRequestStatus(tier);
            const isPending = status === 'pending';
            const isApproved = status === 'approved';
            const isDeclined = status === 'declined';

            return (
              <Card 
                key={tier} 
                className={`relative transition-all hover:shadow-lg ${
                  isCurrentTier ? 'ring-2 ring-primary' : ''
                }`}
              >
                {isCurrentTier && (
                  <Badge className="absolute -top-2 -right-2 bg-primary">
                    Current
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <VipTierIcon tier={tier} size="xl" className="mx-auto mb-2" />
                  <CardTitle className="capitalize">{tier}</CardTitle>
                  <CardDescription>
                    {tier === 'bronze' && 'Get started with VIP'}
                    {tier === 'silver' && 'Enhanced experience'}
                    {tier === 'gold' && 'Premium features'}
                    {tier === 'diamond' && 'Ultimate access'}
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

                  {isCurrentTier ? (
                    <Button className="w-full" disabled>
                      Active
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
                      onClick={() => handleRequestTier(tier)}
                      disabled={!!pendingRequest || requestingTier === tier}
                    >
                      {requestingTier === tier ? "Requesting..." : "Request Again"}
                    </Button>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => handleRequestTier(tier)}
                      disabled={!!pendingRequest || requestingTier === tier}
                    >
                      {requestingTier === tier ? "Requesting..." : "Request Free"}
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
    </div>
  );
};

export default VipShop;
