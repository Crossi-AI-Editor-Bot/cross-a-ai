import { useEffect, useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

const DISMISSED_KEY = "dismissed_notifications";

export const NotificationPopup = () => {
  const { data: notifications, isLoading } = useNotifications();
  const [currentNotification, setCurrentNotification] = useState<{
    id: string;
    title: string;
    message: string;
  } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading || !notifications || notifications.length === 0) return;

    // Get dismissed notification IDs from localStorage
    const dismissedIds: string[] = JSON.parse(
      localStorage.getItem(DISMISSED_KEY) || "[]"
    );

    // Find first notification that hasn't been dismissed
    const unreadNotification = notifications.find(
      (n) => !dismissedIds.includes(n.id)
    );

    if (unreadNotification) {
      setCurrentNotification(unreadNotification);
      setOpen(true);
    }
  }, [notifications, isLoading]);

  const handleDismiss = () => {
    if (currentNotification) {
      const dismissedIds: string[] = JSON.parse(
        localStorage.getItem(DISMISSED_KEY) || "[]"
      );
      dismissedIds.push(currentNotification.id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedIds));
    }
    setOpen(false);
    setCurrentNotification(null);
  };

  if (!currentNotification) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <DialogTitle>{currentNotification.title}</DialogTitle>
          </div>
          <DialogDescription className="pt-4 text-foreground/80 whitespace-pre-wrap">
            {currentNotification.message}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end mt-4">
          <Button onClick={handleDismiss}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
