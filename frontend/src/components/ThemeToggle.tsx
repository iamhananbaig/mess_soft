import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sun, Moon } from '@phosphor-icons/react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start gap-2" />
        }
      >
        {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
      </TooltipTrigger>
      <TooltipContent side="right">Toggle theme</TooltipContent>
    </Tooltip>
  );
}
