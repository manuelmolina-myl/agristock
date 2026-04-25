import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface PageTitleContextValue {
  titles: Record<string, string>
  setPageTitle: (path: string, title: string) => void
}

const PageTitleContext = createContext<PageTitleContextValue>({
  titles: {},
  setPageTitle: () => {},
})

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [titles, setTitles] = useState<Record<string, string>>({})

  const setPageTitle = useCallback((path: string, title: string) => {
    setTitles(prev => prev[path] === title ? prev : { ...prev, [path]: title })
  }, [])

  return (
    <PageTitleContext.Provider value={{ titles, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  )
}

export function usePageTitle() {
  return useContext(PageTitleContext)
}

/** Call in any detail page to register its title for the breadcrumb. */
export function useRegisterPageTitle(title: string | undefined) {
  const { setPageTitle } = usePageTitle()
  const location = useLocation()

  useEffect(() => {
    if (title) setPageTitle(location.pathname, title)
  }, [title, location.pathname, setPageTitle])
}
