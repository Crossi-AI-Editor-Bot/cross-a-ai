import { AlertTriangle } from "lucide-react";

interface MaintenancePageProps {
  disabledUntil: Date | null;
}

const MaintenancePage = ({ disabledUntil }: MaintenancePageProps) => {
  const formatDate = (date: Date | null) => {
    if (!date) return "soon";
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="inline-flex w-20 h-20 rounded-2xl bg-destructive/10 items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-4">
          Site Under Maintenance
        </h1>
        <p className="text-muted-foreground mb-6">
          We're currently performing maintenance. The site will be back online {formatDate(disabledUntil)}.
        </p>
        <p className="text-sm text-muted-foreground">
          Thank you for your patience!
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;
