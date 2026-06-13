'use client'

export type DocumentType = 'passport' | 'bank' | 'payroll'

export interface DocumentFiles {
  passport: File | null
  bank: File | null
  payroll: File | null
}

export interface DocumentPdfPayload {
  passport: string
  bank: string
  payroll: string
}

interface DocumentUploadProps {
  documents: DocumentFiles
  onDocumentFile: (type: DocumentType, file: File | null) => void
  onError: (message: string) => void
}

const LABELS: Record<DocumentType, string> = {
  passport: 'Passport',
  bank: 'Bank Statement',
  payroll: 'Payroll / Pay Stub',
}

async function extractPDFPreview(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 2); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    text += content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .concat('\n')
  }

  return text.slice(0, 300)
}

export async function filesToBase64(documents: DocumentFiles): Promise<DocumentPdfPayload> {
  async function encode(file: File | null) {
    if (!file) return ''
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  return {
    passport: await encode(documents.passport),
    bank: await encode(documents.bank),
    payroll: await encode(documents.payroll),
  }
}

export function DocumentUpload({ documents, onDocumentFile, onError }: DocumentUploadProps) {
  async function handleFileUpload(type: DocumentType, file: File) {
    try {
      await extractPDFPreview(file)
      onDocumentFile(type, file)
    } catch {
      onError(`Failed to read ${LABELS[type]} document`)
    }
  }

  return (
    <div className="space-y-4">
      {(Object.keys(LABELS) as DocumentType[]).map((type) => (
        <div key={type}>
          <label className="mb-1 block text-sm font-medium">{LABELS[type]}</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFileUpload(type, file)
            }}
            className="w-full rounded border p-2"
          />
          {documents[type] ? (
            <p className="mt-1 text-xs text-emerald-600">
              PDF ready ({Math.round(documents[type]!.size / 1024)} KB) — sent as base64 to Chainlink Attester TEE
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
