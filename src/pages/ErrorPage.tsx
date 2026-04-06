import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const ErrorPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { statusCode?: number; responseBody?: string; url?: string } | null;

  const statusCode = state?.statusCode || 500;
  const responseBody = state?.responseBody || '{"error":"Unknown error"}';
  const url = state?.url || "Unknown";

  let formattedJson: string;
  try {
    formattedJson = JSON.stringify(JSON.parse(responseBody), null, 2);
  } catch {
    formattedJson = responseBody;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        <div>
          <h1 className="text-6xl font-bold text-destructive">{statusCode}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {statusCode >= 500 ? "Server Error" : "Request Error"}
          </p>
        </div>

        <div className="text-left">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Endpoint</p>
          <p className="mb-4 break-all rounded-md bg-muted p-2 text-xs font-mono text-foreground">
            {url}
          </p>

          <p className="mb-1 text-xs font-medium text-muted-foreground">Response</p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {formattedJson}
          </pre>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="default" onClick={() => navigate("/")}>
            Go Home
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
