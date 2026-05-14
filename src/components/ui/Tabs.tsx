import { createContext, useContext, useState, type ReactNode } from 'react';

interface TabsContextValue {
  active: string;
  setActive: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  defaultTab: string;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultTab, children, className = '' }: TabsProps) {
  const [active, setActive] = useState(defaultTab);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={`flex flex-col ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: ReactNode;
  className?: string;
}

export function TabList({ children, className = '' }: TabListProps) {
  return (
    <div
      role="tablist"
      className={`flex border-b border-aegis-200 gap-0 ${className}`}
    >
      {children}
    </div>
  );
}

interface TabTriggerProps {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}

export function TabTrigger({ id, disabled = false, children }: TabTriggerProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabTrigger must be inside <Tabs>');
  const isActive = ctx.active === id;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && ctx.setActive(id)}
      className={`
        px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
        ${isActive
          ? 'border-aegis-500 text-aegis-700'
          : disabled
          ? 'border-transparent text-aegis-200 cursor-not-allowed'
          : 'border-transparent text-aegis-200 hover:text-aegis-500 hover:border-aegis-300 cursor-pointer'
        }
      `}
    >
      {children}
      {disabled && (
        <span className="ml-1.5 text-xs text-aegis-200">(soon)</span>
      )}
    </button>
  );
}

interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, children, className = '' }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabPanel must be inside <Tabs>');
  if (ctx.active !== id) return null;
  return (
    <div role="tabpanel" className={`flex-1 min-h-0 ${className}`}>
      {children}
    </div>
  );
}
