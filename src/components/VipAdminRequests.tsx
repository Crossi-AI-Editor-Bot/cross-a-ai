import { useState } from "react";
import { Check, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { VipTierBadge, type VipTierType } from "@/components/VipTierIcon";
import { useVipRequests, type VipRequest } from "@/hooks/useVipRequests";
import { formatDistanceToNow } from "date-fns";

const VipAdminRequests = () => {
  const { toast } = useToast();
  const { requests, approveRequest, declineRequest, loading } = useVipRequests(true);
  const [selectedRequest, setSelectedRequest] = useState<VipRequest | null>(null);
  const [action, setAction] = useState<'approve' | 'decline' | null>(null);
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleAction = async () => {
    if (!selectedRequest || !action) return;

    setProcessing(true);
    const result = action === 'approve' 
      ? await approveRequest(selectedRequest.id, notes)
      : await declineRequest(selectedRequest.id, notes);
    setProcessing(false);

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      });
    } else {
      toast({
        title: action === 'approve' ? "Request Approved" : "Request Declined",
        description: action === 'approve' 
          ? "The user has been granted VIP status."
          : "The request has been declined.",
      });
      setSelectedRequest(null);
      setAction(null);
      setNotes("");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>VIP Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse text-muted-foreground">Loading requests...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Pending VIP Requests
          </CardTitle>
          <CardDescription>
            Review and manage VIP tier requests from users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No pending requests
            </p>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <div 
                  key={request.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{request.user_email}</p>
                      <p className="text-sm text-muted-foreground">
                        Requested {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <VipTierBadge tier={request.requested_tier as VipTierType} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => {
                        setSelectedRequest(request);
                        setAction('approve');
                      }}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setSelectedRequest(request);
                        setAction('decline');
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedRequest && !!action} onOpenChange={() => {
        setSelectedRequest(null);
        setAction(null);
        setNotes("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve' : 'Decline'} VIP Request
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? `Grant ${selectedRequest?.requested_tier} VIP status to ${selectedRequest?.user_email}?`
                : `Decline the ${selectedRequest?.requested_tier} VIP request from ${selectedRequest?.user_email}?`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Admin Notes (optional)</label>
              <Textarea
                placeholder="Add a note for this decision..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setSelectedRequest(null);
                setAction(null);
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              variant={action === 'approve' ? 'default' : 'destructive'}
            >
              {processing ? "Processing..." : action === 'approve' ? 'Approve' : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VipAdminRequests;
