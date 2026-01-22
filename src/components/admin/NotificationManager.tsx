import { useState } from "react";
import { useAllNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const NotificationManager = () => {
  const { data: notifications, isLoading } = useAllNotifications();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Please fill in both title and message");
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from("notifications").insert({
        title: title.trim(),
        message: message.trim(),
        active: true,
      });

      if (error) throw error;

      toast.success("Notification created successfully");
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      console.error("Error creating notification:", error);
      toast.error("Failed to create notification");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ active: !currentActive })
        .eq("id", id);

      if (error) throw error;

      toast.success(
        currentActive ? "Notification deactivated" : "Notification activated"
      );
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      console.error("Error toggling notification:", error);
      toast.error("Failed to update notification");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Notification deleted");
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast.error("Failed to delete notification");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create new notification */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <h3 className="font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create New Notification
          </h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Notification title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Notification message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Notification"}
            </Button>
          </div>
        </div>

        {/* Existing notifications */}
        <div className="space-y-3">
          <h3 className="font-medium">Existing Notifications</h3>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : notifications?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No notifications yet</p>
          ) : (
            <div className="space-y-2">
              {notifications?.map((notification) => (
                <div
                  key={notification.id}
                  className="flex items-start justify-between gap-4 p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{notification.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(notification.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${notification.id}`} className="text-xs">
                        Active
                      </Label>
                      <Switch
                        id={`active-${notification.id}`}
                        checked={notification.active}
                        onCheckedChange={() =>
                          handleToggleActive(notification.id, notification.active)
                        }
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete notification?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this notification.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(notification.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
