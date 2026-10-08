import { useCallback, useMemo, useState } from 'react';

/** Open/closed state for a group of panels, with "expand all" over a known set of ids. */
export function useDisclosure(ids: string[], initiallyOpen: string[] = []) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initiallyOpen));

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const allOpen = useMemo(() => ids.length > 0 && ids.every((id) => open.has(id)), [ids, open]);

  return {
    isOpen: (id: string) => open.has(id),
    toggle,
    allOpen,
    toggleAll: () => setOpen(allOpen ? new Set<string>() : new Set(ids)),
    openOne: (id: string) => setOpen((prev) => new Set(prev).add(id)),
  };
}
