import { Crown, Award, Star, Gem, Coins, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";

export type VipTierType = 'copper' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

interface VipTierIconProps {
  tier: VipTierType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  className?: string;
}

const tierConfig: Record<VipTierType, { 
  icon: typeof Crown; 
  label: string; 
  gradient: string;
  textColor: string;
  bgColor: string;
}> = {
  copper: {
    icon: Coins,
    label: 'Copper',
    gradient: 'from-orange-700 to-orange-500',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-100',
  },
  bronze: {
    icon: Award,
    label: 'Bronze',
    gradient: 'from-amber-700 to-amber-500',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-100',
  },
  silver: {
    icon: Star,
    label: 'Silver',
    gradient: 'from-slate-400 to-slate-300',
    textColor: 'text-slate-500',
    bgColor: 'bg-slate-100',
  },
  gold: {
    icon: Crown,
    label: 'Gold',
    gradient: 'from-yellow-500 to-yellow-400',
    textColor: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  platinum: {
    icon: Hexagon,
    label: 'Platinum',
    gradient: 'from-purple-500 to-purple-400',
    textColor: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  diamond: {
    icon: Gem,
    label: 'Diamond',
    gradient: 'from-cyan-400 to-blue-500',
    textColor: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
};

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const containerSizes = {
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
};

export const VipTierIcon = ({ tier, size = 'md', showLabel = false, className }: VipTierIconProps) => {
  const config = tierConfig[tier];
  const Icon = config.icon;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center shadow-md",
        config.gradient,
        containerSizes[size]
      )}>
        <Icon className={cn(sizeClasses[size], "text-white drop-shadow")} />
      </div>
      {showLabel && (
        <span className={cn("font-semibold text-sm", config.textColor)}>
          {config.label}
        </span>
      )}
    </div>
  );
};

export const VipTierBadge = ({ tier, className }: { tier: VipTierType; className?: string }) => {
  const config = tierConfig[tier];
  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
      config.bgColor,
      config.textColor,
      className
    )}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </div>
  );
};

export default VipTierIcon;
