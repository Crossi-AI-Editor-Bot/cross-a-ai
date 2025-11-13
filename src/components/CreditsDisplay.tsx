import { Coins } from "lucide-react";

interface CreditsDisplayProps {
  credits: number;
}

const CreditsDisplay = ({ credits }: CreditsDisplayProps) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg">
      <Coins className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium text-foreground">
        {credits.toFixed(1)} / 20 credits
      </span>
    </div>
  );
};

export default CreditsDisplay;
