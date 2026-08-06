import { toast } from '@/components/ui/toast';

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toast.add({ type, title: message });
}
