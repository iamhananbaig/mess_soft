import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
  className?: string;
}

const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  'super-admin': 'default',
  admin: 'default',
  manager: 'outline',
  cashier: 'outline',
  employee: 'secondary',
};

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  const v = variant || statusVariants[status.toLowerCase()] || 'secondary';
  return (
    <Badge variant={v} className={cn('capitalize', className)}>
      {status}
    </Badge>
  );
}
