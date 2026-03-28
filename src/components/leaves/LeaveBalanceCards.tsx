import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { LeaveBalance } from '@/hooks/useLeaves';
import { Palmtree, Thermometer, User } from 'lucide-react';

interface Props {
  balances: LeaveBalance | undefined;
  isLoading: boolean;
}

type BalanceKey = 'annual' | 'sick' | 'personal';
type UsedKey = 'used_annual' | 'used_sick' | 'used_personal';

interface Item {
  key: BalanceKey;
  usedKey: UsedKey;
  label: string;
  icon: React.ElementType;
  color: string;
}

const items: Item[] = [
  { key: 'annual', usedKey: 'used_annual', label: 'Annual Leave', icon: Palmtree, color: 'text-success' },
  { key: 'sick', usedKey: 'used_sick', label: 'Sick Leave', icon: Thermometer, color: 'text-warning' },
  { key: 'personal', usedKey: 'used_personal', label: 'Personal Leave', icon: User, color: 'text-info' },
];

export function LeaveBalanceCards({ balances, isLoading }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((item) => {
        const total = balances?.[item.key] ?? 0;
        const used = balances?.[item.usedKey] ?? 0;

        const remaining = total - used;
        const pct = total > 0 ? (used / total) * 100 : 0;

        return (
          <Card key={item.key} className="border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {isLoading ? '...' : `${remaining} of ${total} remaining`}
                  </p>
                </div>
              </div>
              <Progress value={pct} className="h-2" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}