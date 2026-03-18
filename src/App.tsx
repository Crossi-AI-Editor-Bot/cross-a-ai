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
import NotFound from "./pages/NotFound";
import { NotificationPopup } from "./components/NotificationPopup";
import { useIpBanCheck } from "./hooks/useIpBanCheck";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <NotificationPopup />
      <BrowserRouter>
        <BanGuard>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/vip" element={<VipShop />} />
            <Route path="/banned" element={<Banned />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BanGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
