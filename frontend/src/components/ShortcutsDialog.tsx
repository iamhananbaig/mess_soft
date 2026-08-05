import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcutGroups = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['/'], label: 'Focus search' },
      { keys: ['←', '→'], label: 'Switch category tabs' },
    ],
  },
  {
    title: 'Cart',
    shortcuts: [
      { keys: ['Ctrl', 'Enter'], label: 'Checkout (pay cash)' },
      { keys: ['Ctrl', 'Backspace'], label: 'Clear cart' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], label: 'Show shortcuts' },
      { keys: ['Esc'], label: 'Clear search / blur input' },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {shortcutGroups.map((group, i) => (
            <div key={group.title}>
              {i > 0 && <Separator className="mb-3" />}
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {group.title}
              </h4>
              <div className="space-y-1.5">
                {group.shortcuts.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-sm">
                    <span>{s.label}</span>
                    <KbdGroup>
                      {s.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
