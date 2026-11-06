import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Ctx = { leaf: string | null; setLeaf: (s: string | null) => void };

const BreadcrumbContext = createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState<string | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ leaf, setLeaf }}>{children}</BreadcrumbContext.Provider>
  );
}

/** Read by AppLayout to render a third breadcrumb segment for detail pages. */
export function useBreadcrumbLeaf(): string | null {
  return useContext(BreadcrumbContext)?.leaf ?? null;
}

/**
 * A detail page calls this with its record name to add a third breadcrumb segment
 * (e.g. `Dashboard › Inventory Types › Electronics`). Clears on unmount.
 */
export function usePageBreadcrumb(leaf: string | null | undefined) {
  const ctx = useContext(BreadcrumbContext);
  useEffect(() => {
    ctx?.setLeaf(leaf ?? null);
    return () => ctx?.setLeaf(null);
  }, [ctx, leaf]);
}
