import { useCallback, useState, type MouseEvent } from 'react';
import { useLocation } from 'react-router';

export function useMobileNavigation() {
  const { key } = useLocation();
  const [menu, setMenu] = useState({ key, open: false });
  // Clear the previous entry's state so browser Back cannot reopen its drawer.
  if (menu.key !== key) setMenu({ key, open: false });
  const closeMenu = useCallback(() => {
    setMenu((current) => (current.open ? { ...current, open: false } : current));
  }, []);
  return {
    open: menu.key === key && menu.open,
    openMenu: (event: MouseEvent<HTMLButtonElement>) => {
      event.currentTarget.focus();
      setMenu({ key, open: true });
    },
    closeMenu,
  };
}
