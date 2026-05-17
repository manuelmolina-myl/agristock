/**
 * SignaturePad — canvas para captura de firma manuscrita (mouse + touch + pen).
 *
 * Output: data URL del PNG generado vía canvas.toDataURL('image/png').
 * Tokens "Tierra cultivada": fondo paper, trazo ink, border-border.
 *
 * Uso:
 *   const ref = useRef<SignaturePadHandle>(null)
 *   <SignaturePad ref={ref} />
 *   // ...al confirmar:
 *   const dataUrl = ref.current?.toDataUrl()
 *   if (!dataUrl) // pad estaba vacío
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface SignaturePadHandle {
  /** Returns the PNG data URL, or null if the pad has no strokes. */
  toDataUrl(): string | null
  /** Wipes all strokes. */
  clear(): void
  /** Whether the user has drawn anything. */
  isEmpty(): boolean
}

interface SignaturePadProps {
  /** Height of the canvas in CSS pixels.  Width fills the container. */
  height?: number
  /** Optional callback whenever the dirty state changes. */
  onDirty?: (dirty: boolean) => void
  className?: string
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { height = 180, onDirty, className },
  ref,
) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef   = useRef(false)
  const lastPtRef    = useRef<{ x: number; y: number } | null>(null)
  const [dirty, setDirty] = useState(false)

  // Resize the canvas to its container (HiDPI-aware) and reset the drawing
  // context whenever the container width changes.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ratio = window.devicePixelRatio || 1

    const resize = () => {
      const w = container.clientWidth
      const h = height
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')!
      ctx.scale(ratio, ratio)
      // Pen style — solid ink-colored stroke
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1F1A13' // tokens INK
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [height])

  function pointFromEvent(e: PointerEvent | React.PointerEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function startStroke(e: React.PointerEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPtRef.current = pointFromEvent(e)
    if (!dirty) {
      setDirty(true)
      onDirty?.(true)
    }
  }

  function moveStroke(e: React.PointerEvent) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const p = pointFromEvent(e)
    const last = lastPtRef.current
    if (!last) return
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPtRef.current = p
  }

  function endStroke(e: React.PointerEvent) {
    drawingRef.current = false
    lastPtRef.current = null
    const canvas = canvasRef.current
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId)
    }
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const ratio = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio)
    setDirty(false)
    onDirty?.(false)
  }

  function toDataUrl(): string | null {
    if (!dirty) return null
    return canvasRef.current?.toDataURL('image/png') ?? null
  }

  useImperativeHandle(ref, () => ({
    toDataUrl,
    clear,
    isEmpty: () => !dirty,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dirty])

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="relative w-full rounded-lg border border-border bg-card overflow-hidden touch-none select-none"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair"
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
        {!dirty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Firma aquí con mouse, lápiz o dedo
          </div>
        )}
        {/* Signature baseline */}
        <div className="pointer-events-none absolute left-4 right-4 bottom-4 border-t border-dashed border-border" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          La firma quedará grabada en el PDF de la OC.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={!dirty}
          className="gap-1.5 h-7 text-xs"
        >
          <Eraser className="size-3" />
          Limpiar
        </Button>
      </div>
    </div>
  )
})
