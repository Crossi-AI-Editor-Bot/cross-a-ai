import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export const useApiErrorInterceptor = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);

      // Only intercept API calls (supabase functions, etc.), not static assets
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "";
      const isApiCall = url.includes("supabase") || url.includes("functions") || url.includes("lovable");
      
      if (isApiCall && (response.status >= 400) && location.pathname !== "/error" && location.pathname !== "/banned") {
        // Clone response so the original caller still works
        const cloned = response.clone();
        let bodyText: string;
        try {
          bodyText = await cloned.text();
        } catch {
          bodyText = '{"error":"Could not read response body"}';
        }

        navigate("/error", {
          state: {
            statusCode: response.status,
            responseBody: bodyText,
            url: url,
          },
          replace: false,
        });
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [navigate, location.pathname]);
};
