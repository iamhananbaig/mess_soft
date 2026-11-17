import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError, reloadForNewVersion } from '@/lib/staleBuild';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // A page from an older deploy is gone: load the new version instead of showing an error.
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  render() {
    if (this.state.hasError) {
      if (isChunkLoadError(this.state.error)) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
            <p className="text-lg font-medium">The app was updated</p>
            <p className="text-sm text-muted-foreground max-w-md">Reload to continue with the new version.</p>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
          <div className="text-6xl font-bold text-destructive">!</div>
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
