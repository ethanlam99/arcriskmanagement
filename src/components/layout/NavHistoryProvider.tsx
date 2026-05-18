import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavHistoryValue {
  canGoBack:    boolean;
  canGoForward: boolean;
  goBack:    () => void;
  goForward: () => void;
}

const NavHistoryContext = createContext<NavHistoryValue | null>(null);

/**
 * In-app forward/back history. Maintains its own stack & cursor in memory so
 * the TopBar arrows can step through the routes the user has visited in this
 * session, independent of the browser's own history.
 *
 * Resets on full page reload (no localStorage persistence).
 */
export function NavHistoryProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const stack       = useRef<string[]>([]);
  const cursor      = useRef<number>(-1);
  // Set by goBack/goForward so the upcoming location change is not treated as
  // a fresh push that would chop off the forward branch.
  const skipNext    = useRef<boolean>(false);

  const [, bump] = useState(0);

  useEffect(() => {
    const key = location.pathname + location.search;

    if (skipNext.current) {
      skipNext.current = false;
      bump((v) => v + 1);
      return;
    }

    if (stack.current[cursor.current] === key) return;

    // Drop forward branch on a fresh navigation
    stack.current = stack.current.slice(0, cursor.current + 1);
    stack.current.push(key);
    cursor.current = stack.current.length - 1;
    bump((v) => v + 1);
  }, [location.pathname, location.search]);

  function goBack() {
    if (cursor.current <= 0) return;
    cursor.current -= 1;
    skipNext.current = true;
    navigate(stack.current[cursor.current]);
  }

  function goForward() {
    if (cursor.current >= stack.current.length - 1) return;
    cursor.current += 1;
    skipNext.current = true;
    navigate(stack.current[cursor.current]);
  }

  const value: NavHistoryValue = {
    canGoBack:    cursor.current > 0,
    canGoForward: cursor.current < stack.current.length - 1,
    goBack,
    goForward,
  };

  return <NavHistoryContext.Provider value={value}>{children}</NavHistoryContext.Provider>;
}

export function useNavHistory(): NavHistoryValue {
  const ctx = useContext(NavHistoryContext);
  if (!ctx) {
    // Outside the provider — safe no-op fallback so TopBar can render in
    // contexts (e.g. login) where the provider isn't mounted.
    return { canGoBack: false, canGoForward: false, goBack: () => {}, goForward: () => {} };
  }
  return ctx;
}
