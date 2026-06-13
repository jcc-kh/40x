'use client'

export type DocumentType = 'passport' | 'bank' | 'payroll'

interface DocumentUploadProps {
  documents: Record<DocumentType, string>
  onDocumentText: (type: DocumentType, text: string) => void
  onError: (message: string) => void
}

const LABELS: Record<DocumentType, string> = {
  passport: 'Passport',
  bank: 'Bank Statement',
  payroll: 'Payroll / Pay Stub',
}

async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 5); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    text += content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .concat('\n')
  }

  return text.slice(0, 2000)
}

export function DocumentUpload({ documents, onDocumentText, onError }: DocumentUploadProps) {
  async function handleFileUpload(type: DocumentType, file: File) {
    try {
      const text = await extractPDFText(file)
      onDocumentText(type, text)
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
            <p className="mt-1 text-xs text-emerald-600">Text extracted ({documents[type].length} chars)</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
