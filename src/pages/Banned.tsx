import { ShieldX } from "lucide-react";

const Banned = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <ShieldX className="w-16 h-16 text-destructive" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground text-lg">
          Your IP address has been permanently banned due to repeated policy violations.
        </p>
        <p className="text-sm text-muted-foreground">
          If you believe this is a mistake, please contact support.
        </p>
      </div>
    </div>
  );
};

export default Banned;
