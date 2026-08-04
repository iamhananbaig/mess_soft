import { Spinner } from '@/components/ui/spinner';

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
