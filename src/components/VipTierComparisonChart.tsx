import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VipTierIcon, type VipTierType } from "@/components/VipTierIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const tiers: VipTierType[] = ['copper', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];

interface ComparisonFeature {
  name: string;
  values: Record<VipTierType, string | boolean>;
}

const comparisonFeatures: ComparisonFeature[] = [
  {
    name: "Daily Credits",
    values: {
      copper: "16",
      bronze: "18",
      silver: "20",
      gold: "22",
      platinum: "24",
      diamond: "25",
    },
  },
  {
    name: "VIP Models Access",
    values: {
      copper: "Copper only",
      bronze: "Copper, Bronze",
      silver: "Copper–Silver",
      gold: "Copper–Gold",
      platinum: "Copper–Platinum",
      diamond: "All Models",
    },
  },
  {
    name: "Priority Support",
    values: {
      copper: "Basic",
      bronze: true,
      silver: true,
      gold: true,
      platinum: true,
      diamond: "Direct Admin",
    },
  },
  {
    name: "Extended Chat History",
    values: {
      copper: false,
      bronze: false,
      silver: true,
      gold: true,
      platinum: true,
      diamond: true,
    },
  },
  {
    name: "Early Feature Access",
    values: {
      copper: false,
      bronze: false,
      silver: false,
      gold: true,
      platinum: true,
      diamond: true,
    },
  },
  {
    name: "Exclusive Features",
    values: {
      copper: false,
      bronze: false,
      silver: false,
      gold: false,
      platinum: true,
      diamond: true,
    },
  },
];

const tierColors: Record<VipTierType, string> = {
  copper: "text-orange-600",
  bronze: "text-amber-700",
  silver: "text-slate-400",
  gold: "text-yellow-500",
  platinum: "text-cyan-400",
  diamond: "text-purple-400",
};

const VipTierComparisonChart = () => {
  const renderValue = (value: string | boolean) => {
    if (typeof value === "boolean") {
      return value ? (
        <Check className="w-5 h-5 text-green-500 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-muted-foreground/40 mx-auto" />
      );
    }
    return <span className="font-medium">{value}</span>;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-center">Tier Comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[180px] font-semibold">Feature</TableHead>
                {tiers.map((tier) => (
                  <TableHead key={tier} className="text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <VipTierIcon tier={tier} size="sm" />
                      <span className={`capitalize text-xs font-medium ${tierColors[tier]}`}>
                        {tier}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonFeatures.map((feature, index) => (
                <TableRow 
                  key={feature.name}
                  className={index % 2 === 0 ? "bg-muted/10" : ""}
                >
                  <TableCell className="font-medium text-sm">
                    {feature.name}
                  </TableCell>
                  {tiers.map((tier) => (
                    <TableCell key={tier} className="text-center text-sm">
                      {renderValue(feature.values[tier])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default VipTierComparisonChart;
