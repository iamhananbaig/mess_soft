import { toast } from '@/components/ui/toast';

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toast.add({ type, title: message });
}

/** Extract the API's `message` from an Axios error, falling back to a generic string. */
export function getErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

export function showErrorToast(err: unknown, fallback: string) {
  showToast(getErrorMessage(err, fallback), 'error');
}
