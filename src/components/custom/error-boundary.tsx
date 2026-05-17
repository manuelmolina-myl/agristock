import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertOctagon } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional override for the default fallback UI. */
  fallback?: ReactNode
  /**
   * When this value changes, the boundary resets its internal error state.
   * Useful for clearing the error when the user navigates to a different route.
   */
  resetKey?: string | number
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Catches uncaught render errors in the React tree below it and renders a
 * friendly fallback instead of crashing the whole app.
 *
 * Does NOT catch errors thrown inside async callbacks / event handlers /
 * effects — those are handled by TanStack Query (toasts via
 * `formatSupabaseError`) and by Sentry's global handler.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always log to the console so devs can investigate.
    console.error("[ErrorBoundary] uncaught render error:", error, info)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.hasError &&
      (prevProps.resetKey !== this.props.resetKey ||
        prevProps.children !== this.props.children)
    ) {
      this.setState({ hasError: false, error: null })
    }
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    const isDev = import.meta.env.DEV
    const message = this.state.error?.message

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertOctagon className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                Algo salió mal
              </h2>
              <p className="text-sm text-muted-foreground">
                Encontramos un error al cargar esta sección. Intenta recargar.
              </p>
            </div>

            {isDev && message && (
              <pre className="max-h-32 w-full overflow-auto rounded-md border border-border bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
                {message}
              </pre>
            )}

            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Recargar página
              </button>
              <a
                href="/"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Volver al inicio
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
