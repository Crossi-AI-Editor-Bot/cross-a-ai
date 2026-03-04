import { Bot } from "lucide-react";

const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col items-center justify-center gap-6">
      {/* Animated logo */}
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]">
          <Bot className="w-10 h-10 text-primary-foreground" />
        </div>
        {/* Orbiting dots */}
        <div className="absolute inset-0 w-20 h-20 animate-spin" style={{ animationDuration: '3s' }}>
          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-2 h-2 rounded-full bg-primary opacity-80" />
        </div>
        <div className="absolute inset-0 w-20 h-20 animate-spin" style={{ animationDuration: '3s', animationDelay: '1s' }}>
          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-1.5 h-1.5 rounded-full bg-accent opacity-60" />
        </div>
        <div className="absolute inset-0 w-20 h-20 animate-spin" style={{ animationDuration: '3s', animationDelay: '2s' }}>
          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-1 h-1 rounded-full bg-primary opacity-40" />
        </div>
      </div>

      {/* Loading bar */}
      <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
          style={{
            animation: 'loading-bar 1.5s ease-in-out infinite',
          }}
        />
      </div>

      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>

      <style>{`
        @keyframes loading-bar {
          0% { width: 0%; margin-left: 0; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
