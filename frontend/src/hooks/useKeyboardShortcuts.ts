import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  onSearchFocus: () => void;
  onSearchClear: () => boolean;
  onCheckout: () => void;
  onClearCart: () => void;
  onCategoryPrev: () => void;
  onCategoryNext: () => void;
  onShowHelp: () => void;
}

const isEditable = (el: Element | null) =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable);

export function useKeyboardShortcuts(h: ShortcutHandlers) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;

    // Shortcuts that work even inside inputs
    if ((e.key === 'Escape') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (isEditable(target)) {
        target.blur();
        e.preventDefault();
      } else {
        h.onSearchClear();
        e.preventDefault();
      }
      return;
    }

    // All other shortcuts — skip if inside an editable element
    if (isEditable(target)) return;

    const key = e.key.toLowerCase();

    if (key === '/' && !e.ctrlKey && !e.metaKey) {
      h.onSearchFocus();
      e.preventDefault();
      return;
    }

    if (key === '?' || (key === '/' && e.shiftKey)) {
      h.onShowHelp();
      e.preventDefault();
      return;
    }

    if (e.ctrlKey && key === 'enter') {
      h.onCheckout();
      e.preventDefault();
      return;
    }

    if (e.ctrlKey && key === 'backspace') {
      h.onClearCart();
      e.preventDefault();
      return;
    }

    if (key === 'arrowleft') {
      h.onCategoryPrev();
      e.preventDefault();
      return;
    }

    if (key === 'arrowright') {
      h.onCategoryNext();
      e.preventDefault();
      return;
    }
  }, [h]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
