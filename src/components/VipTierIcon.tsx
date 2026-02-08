import { Crown, Award, Star, Gem, Coins, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVipTiers, type VipTierConfig } from "@/hooks/useVipTiers";

export type VipTierType = string;

interface VipTierIconProps {
  tier: VipTierType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  className?: string;
}

const iconMap: Record<string, typeof Crown> = {
  Crown, Award, Star, Gem, Coins, Hexagon,
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
  const { getTierConfig } = useVipTiers();
  const config = getTierConfig(tier);

  const Icon = iconMap[config?.icon_name || 'Crown'] || Crown;
  const gradientFrom = config?.gradient_from || 'from-gray-400';
  const gradientTo = config?.gradient_to || 'to-gray-300';
  const textColor = config?.text_color || 'text-gray-500';
  const displayName = config?.display_name || tier;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center shadow-md",
        gradientFrom,
        gradientTo,
        containerSizes[size]
      )}>
        <Icon className={cn(sizeClasses[size], "text-white drop-shadow")} />
      </div>
      {showLabel && (
        <span className={cn("font-semibold text-sm", textColor)}>
          {displayName}
        </span>
      )}
    </div>
  );
};

export const VipTierBadge = ({ tier, className }: { tier: VipTierType; className?: string }) => {
  const { getTierConfig } = useVipTiers();
  const config = getTierConfig(tier);

  const Icon = iconMap[config?.icon_name || 'Crown'] || Crown;
  const bgColor = config?.bg_color || 'bg-gray-100';
  const textColor = config?.text_color || 'text-gray-500';
  const displayName = config?.display_name || tier;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
      bgColor,
      textColor,
      className
    )}>
      <Icon className="w-3.5 h-3.5" />
      {displayName}
    </div>
  );
};

export default VipTierIcon;
