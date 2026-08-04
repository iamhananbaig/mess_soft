import { toast } from '@/components/ui/toast';

export function showToast(message: string, variant: 'success' | 'error' | 'info' = 'info') {
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  toast.add({
    title: `${icons[variant]} ${message}`,
  });
}
