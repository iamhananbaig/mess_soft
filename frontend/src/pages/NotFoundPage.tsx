import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router';
import { House } from '@phosphor-icons/react';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-6xl font-bold text-muted-foreground">404</div>
      <p className="text-lg text-muted-foreground">Page not found</p>
      <Button variant="outline" onClick={() => navigate('/')}>
        <House className="size-4 mr-1.5" /> Go to POS
      </Button>
    </div>
  );
}
