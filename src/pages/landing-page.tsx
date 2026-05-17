import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useTheme } from '@/hooks/use-theme'
import { ROLE_ROUTES_NEW } from '@/lib/constants'
import {
  Warehouse,
  ArrowRight,
  BarChart3,
  Shield,
  Fuel,
  Package,
  DollarSign,
  MapPin,
  ClipboardList,
  Moon,
  Sun,
  ChevronRight,
  Check,
  Layers,
  Globe,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function Nav() {
  const { profile, primaryRole } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="size-4.5" strokeWidth={1.75} />
          </div>
          <span className="font-heading text-[15px] font-semibold tracking-tight">AgriStock</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cambiar tema"
          >
            {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {profile ? (
            <Link
              to={primaryRole ? (ROLE_ROUTES_NEW[primaryRole] ?? '/admin') : '/admin'}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ir al panel
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Iniciar sesion
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}

const FEATURES = [
  {
    icon: Package,
    title: 'Inventario inteligente',
    description: 'Control de stock en tiempo real con costo promedio ponderado, alertas de punto de reorden y kardex automatico.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: DollarSign,
    title: 'Costeo multimoneda',
    description: 'Manejo nativo de MXN y USD. Cada insumo conserva su moneda original con conversion automatica via tipo de cambio DOF.',
    color: 'text-usd',
    bg: 'bg-usd/10',
  },
  {
    icon: Fuel,
    title: 'Control de diesel',
    description: 'Registro de cargas por tractor y operador. Horometro, rendimiento L/hora y deteccion de anomalias.',
    color: 'text-diesel',
    bg: 'bg-diesel/10',
  },
  {
    icon: MapPin,
    title: 'Centros de costo',
    description: 'Asigna cada salida a un lote de cultivo, tractor o empleado. Conoce el costo por hectarea en tiempo real.',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    icon: BarChart3,
    title: '12 reportes ejecutivos',
    description: 'Kardex, existencias valuadas, consumo por lote, rotacion de inventario. Exporta a PDF y Excel en un clic.',
    color: 'text-usd',
    bg: 'bg-usd/10',
  },
  {
    icon: Shield,
    title: 'Auditoria completa',
    description: 'Cada movimiento queda registrado con usuario, timestamp y diff antes/despues. Trazabilidad total.',
    color: 'text-warning',
    bg: 'bg-warning/10',
  },
]

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Registra entradas',
    description: 'Captura compras con proveedor, factura y tipo de cambio. El costo promedio se recalcula automaticamente.',
  },
  {
    step: '02',
    title: 'Asigna salidas',
    description: 'Entrega material a lotes, tractores o empleados. Genera vales de salida en PDF con folio y firma.',
  },
  {
    step: '03',
    title: 'Analiza costos',
    description: 'Consulta reportes por lote, por tractor o por proveedor. Toma decisiones con datos reales.',
  },
  {
    step: '04',
    title: 'Cierra temporada',
    description: 'Al final del ciclo, congela saldos, genera snapshot contable y arranca la siguiente temporada limpio.',
  },
]

const STATS = [
  { value: '4', label: 'Roles de usuario' },
  { value: '17', label: 'Tablas en BD' },
  { value: '12', label: 'Tipos de reporte' },
  { value: '2', label: 'Monedas (MXN/USD)' },
]

const MODULES = [
  { icon: Package, label: 'Inventario' },
  { icon: ClipboardList, label: 'Entradas y Salidas' },
  { icon: Fuel, label: 'Diesel' },
  { icon: MapPin, label: 'Lotes de Cultivo' },
  { icon: BarChart3, label: 'Reportes' },
  { icon: Shield, label: 'Auditoria' },
  { icon: DollarSign, label: 'Tipo de Cambio' },
  { icon: Layers, label: 'Cierre de Temporada' },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl dark:bg-primary/8" />
          <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-primary/3 blur-3xl dark:bg-primary/5" />
          <div className="absolute left-0 top-1/2 h-[400px] w-[400px] rounded-full bg-usd/3 blur-3xl dark:bg-usd/5" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
              <span className="flex size-1.5 rounded-full bg-primary animate-pulse" />
              Sistema de gestion de almacenes agricolas
            </div>

            <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Control total de tu{' '}
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                almacen agricola
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              Inventario multimoneda, costeo por lote y tractor, control de diesel, reportes ejecutivos y trazabilidad completa. Todo en una sola plataforma.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/login"
                className="flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
              >
                Comenzar ahora
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#features"
                className="flex h-11 items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-6 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-muted"
              >
                Ver funcionalidades
                <ChevronRight className="size-4 text-muted-foreground" />
              </a>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-heading text-2xl font-bold text-foreground sm:text-3xl">{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Modules ribbon ────────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {MODULES.map((m) => (
              <div key={m.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <m.icon className="size-3.5" />
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ──────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Todo lo que necesitas para gestionar tu almacen
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Disenado especificamente para la agroindustria mexicana. Sin funciones genericas que no usaras.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-border hover:bg-card hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
              >
                <div className={cn('flex size-10 items-center justify-center rounded-xl', feature.bg)}>
                  <feature.icon className={cn('size-5', feature.color)} strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 font-heading text-[15px] font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ──────────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Flujo de trabajo simple
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              De la compra al cierre de temporada en 4 pasos.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.step} className="relative">
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-6 bg-border lg:block" />
                )}
                <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">
                    {step.step}
                  </div>
                  <h3 className="mt-3 font-heading text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Roles ─────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Cada usuario ve lo que necesita
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              4 roles con permisos granulares. El almacenista ve costos solo al recibir; el supervisor solo solicita.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                role: 'Super Admin',
                desc: 'Todo: configuracion, usuarios, cierre de temporada, auditoria completa.',
                features: ['Configuracion global', 'Gestion de usuarios', 'Cierre de temporada', 'Todos los reportes'],
                color: 'border-primary/30 bg-primary/5',
              },
              {
                role: 'Gerente',
                desc: 'Ve todo, aprueba salidas grandes, accede a reportes financieros.',
                features: ['Dashboard ejecutivo', 'Reportes financieros', 'Aprobacion de salidas', 'Costos completos'],
                color: 'border-usd/30 bg-usd/5',
              },
              {
                role: 'Almacenista',
                desc: 'Registra entradas y salidas. Ve costos solo al recibir material.',
                features: ['Entradas y salidas', 'Stock en tiempo real', 'Carga de diesel', 'Costos solo en entradas'],
                color: 'border-warning/30 bg-warning/5',
              },
              {
                role: 'Supervisor',
                desc: 'Solicita salidas desde campo, ve estado de sus solicitudes.',
                features: ['Solicitudes de material', 'Estado de pedidos', 'Vista simplificada', 'Acceso movil'],
                color: 'border-purple-500/30 bg-purple-500/5',
              },
            ].map((r) => (
              <div key={r.role} className={cn('rounded-2xl border p-5', r.color)}>
                <h3 className="font-heading text-sm font-semibold text-foreground">{r.role}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{r.desc}</p>
                <ul className="mt-4 flex flex-col gap-1.5">
                  {r.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Check className="size-3 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tech stack ────────────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-muted/20 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
              Construido con tecnologia moderna
            </h2>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {[
              { icon: Zap, label: 'React + TypeScript' },
              { icon: Layers, label: 'Supabase (Postgres)' },
              { icon: Globe, label: 'Vercel Deploy' },
              { icon: Shield, label: 'RLS + Auditoria' },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <t.icon className="size-4" />
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ───────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-usd/5 p-8 sm:p-12 lg:p-16">
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-usd/10 blur-3xl" />

            <div className="relative mx-auto max-w-xl text-center">
              <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                Empieza a controlar tu almacen hoy
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Registrate gratis, carga tu catalogo de insumos y registra tu primer movimiento en menos de 10 minutos.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  to="/login"
                  className="flex h-11 items-center gap-2 rounded-xl bg-primary px-8 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl"
                >
                  Acceder a AgriStock
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Warehouse className="size-3.5" strokeWidth={2} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">AgriStock</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            &copy; {new Date().getFullYear()} AgriStock. Gestion de almacenes agricolas.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
