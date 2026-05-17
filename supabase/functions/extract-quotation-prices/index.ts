/**
 * extract-quotation-prices — Edge Function (Deno)
 *
 * Recibe un PDF o imagen de una cotización de proveedor + la lista de
 * renglones solicitados en la requisición, y devuelve un arreglo de
 * precios extraídos por Claude Sonnet vision, alineados al orden de los
 * renglones del request.
 *
 * Request (multipart/form-data):
 *   - file:               File (application/pdf | image/png | image/jpeg | image/webp)
 *   - requisitionLines:   string (JSON) [{ index, description, quantity?, unit? }]
 *
 * Response 200:
 *   { lines: [{ index, unit_price, currency, matched, supplier_description, notes }] }
 *
 * Response 4xx/5xx:
 *   { error: string }
 *
 * Secret requerida: ANTHROPIC_API_KEY (configurar con
 *   `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`)
 *
 * Deploy: `npx supabase functions deploy extract-quotation-prices`
 */

// deno-lint-ignore-file no-explicit-any
// @ts-expect-error Deno runtime import — TypeScript no resuelve esm.sh en el editor.
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ReqLineInput {
  index: number
  description: string
  quantity?: number | null
  unit?: string | null
}

interface ExtractedLine {
  index: number
  unit_price: number | null
  currency: 'MXN' | 'USD'
  matched: boolean
  supplier_description: string | null
  notes: string | null
}

function buildPrompt(reqLines: ReqLineInput[]): string {
  const enumerated = reqLines
    .map(
      (rl) =>
        `[${rl.index}] ${rl.description}${
          rl.quantity != null ? ` — cantidad: ${rl.quantity} ${rl.unit ?? ''}` : ''
        }`,
    )
    .join('\n')

  return `Eres un asistente que extrae precios de cotizaciones de proveedores en México.

El cliente solicitó estos materiales (con su index entre corchetes):
${enumerated}

Analiza la cotización adjunta y devuelve EXACTAMENTE un arreglo JSON con un objeto por cada índice solicitado, en el MISMO orden:

[
  { "index": 0, "unit_price": 123.45, "currency": "MXN", "matched": true, "supplier_description": "texto literal del documento", "notes": null },
  { "index": 1, "unit_price": null, "currency": "MXN", "matched": false, "supplier_description": null, "notes": "No aparece en la cotización" }
]

Reglas:
- unit_price: precio UNITARIO SIN IVA si está desglosado; si sólo aparece el total con IVA, divide por (1.16 × cantidad solicitada) cuando la cantidad coincide. Si no hay coincidencia clara entre cantidad solicitada y vendida, usa el precio unitario que aparece en el documento.
- currency: "MXN" o "USD" según lo que diga el documento; si es ambiguo, asume "MXN".
- matched: true si encontraste un renglón en la cotización que corresponde al ítem solicitado.
- supplier_description: el texto LITERAL del documento que matcheaste (útil para que el operador valide).
- notes: observaciones importantes (ej. "incluye IVA", "presentación 5L en lugar de 1L", "precio por paquete de 10, dividido para precio unitario", "no aparece en la cotización").
- Si un ítem solicitado no aparece, matched=false y unit_price=null.
- Mantén el orden exacto del input: un objeto por cada index, en el mismo orden.
- Devuelve SÓLO el JSON, sin texto adicional, sin markdown fences, sin comentarios.`
}

function extractJsonArray(text: string): ExtractedLine[] {
  // Extract first balanced JSON array.  Strip markdown fences first.
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Claude no devolvió JSON parseable')
  return JSON.parse(match[0]) as ExtractedLine[]
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // Chunk to avoid call-stack overflow for large files (~25 MB+).
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// @ts-expect-error Deno runtime global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // @ts-expect-error Deno runtime global
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada en el proyecto')

    const formData = await req.formData()
    const file = formData.get('file')
    const reqLinesRaw = formData.get('requisitionLines')

    if (!(file instanceof File)) {
      throw new Error('Falta el archivo (campo `file` con un File)')
    }
    if (typeof reqLinesRaw !== 'string') {
      throw new Error('Falta `requisitionLines` (JSON string)')
    }

    const requisitionLines = JSON.parse(reqLinesRaw) as ReqLineInput[]
    if (!Array.isArray(requisitionLines) || requisitionLines.length === 0) {
      throw new Error('`requisitionLines` debe ser un arreglo no vacío')
    }

    const mimeType = file.type
    const isPdf = mimeType === 'application/pdf'
    const isImage = mimeType.startsWith('image/')
    if (!isPdf && !isImage) {
      throw new Error(`Tipo de archivo no soportado: ${mimeType}`)
    }

    // Anthropic vision: 5 MB para imágenes, 32 MB para PDFs.
    const limit = isPdf ? 32 * 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > limit) {
      throw new Error(`Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
    }

    const base64 = await fileToBase64(file)
    const prompt = buildPrompt(requisitionLines)

    const anthropic = new Anthropic({ apiKey })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: isPdf ? 'document' : 'image',
              source: {
                type: 'base64',
                media_type: mimeType as any,
                data: base64,
              },
            } as any,
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    })

    const firstBlock = response.content[0]
    const text = firstBlock?.type === 'text' ? firstBlock.text : ''
    if (!text) throw new Error('Claude devolvió respuesta vacía')

    const parsed = extractJsonArray(text)

    return new Response(JSON.stringify({ lines: parsed }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
