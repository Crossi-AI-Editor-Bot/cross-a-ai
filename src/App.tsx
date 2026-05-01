import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminPanel from "./pages/AdminPanel";
import VipShop from "./pages/VipShop";
import Banned from "./pages/Banned";
import ErrorPage from "./pages/ErrorPage";
import NotFound from "./pages/NotFound";
import { NotificationPopup } from "./components/NotificationPopup";
import { useIpBanCheck } from "./hooks/useIpBanCheck";
import { useApiErrorInterceptor } from "./hooks/useApiErrorInterceptor";
import { useEffect } from "react";
import { ensurePuterSignedIn } from "./lib/externalModels";

const queryClient = new QueryClient();

const BanGuard = ({ children }: { children: React.ReactNode }) => {
  const { isBanned, loading } = useIpBanCheck();
  const location = useLocation();

  if (loading) return null;

  if (isBanned && location.pathname !== "/banned") {
    return <Navigate to="/banned" replace />;
  }

  if (!isBanned && location.pathname === "/banned") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const ApiErrorInterceptorWrapper = ({ children }: { children: React.ReactNode }) => {
  useApiErrorInterceptor();
  return <>{children}</>;
};

const PuterWarmup = () => {
  useEffect(() => {
    // Wait briefly for puter.js script to load, then silently provision
    // a temporary Puter user in the background. No popup, no UI.
    let cancelled = false;
    const tryWarm = async (attempt = 0) => {
      if (cancelled) return;
      if (typeof window === "undefined") return;
      if (!window.puter?.auth?.isSignedIn) {
        if (attempt < 20) setTimeout(() => tryWarm(attempt + 1), 500);
        return;
      }
      try {
        await ensurePuterSignedIn();
      } catch (e) {
        // Silent: will retry lazily on first generation.
        console.warn("[Puter] Background warm-up failed:", e);
      }
    };
    tryWarm();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <NotificationPopup />
      <BrowserRouter>
        <ApiErrorInterceptorWrapper>
          <BanGuard>
            <PuterWarmup />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/vip" element={<VipShop />} />
              <Route path="/banned" element={<Banned />} />
              <Route path="/error" element={<ErrorPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BanGuard>
        </ApiErrorInterceptorWrapper>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
