// FileDropzone molecule — drag-and-drop + click-to-browse file upload area
// Accepts: .zip, .csv, .json — max 500MB — per submission page Stitch design
import { cn } from '@/lib/cn'
import { useRef, useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'

const ACCEPTED_EXTENSIONS = ['.zip', '.csv', '.json']
const MAX_SIZE_MB = 500

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  className?: string
}

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(ext))
    return `Invalid type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return `File too large. Max ${MAX_SIZE_MB} MB`
  return null
}

export function FileDropzone({ onFileSelect, className }: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const err = validateFile(file)
    if (err) { setError(err); return }
    setError(null)
    setSelectedFile(file)
    onFileSelect(file)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function clearFile() {
    setSelectedFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-xl text-center cursor-pointer transition-colors select-none',
          isDragOver
            ? 'border-primary bg-primary-container/10 shadow-[0_0_16px_rgba(79,70,229,0.22)]'
            : 'border-outline-variant hover:border-outline hover:bg-surface-container/50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={onChange}
        />
        <p className="text-on-surface text-sm mb-sm font-medium">
          Drag &amp; drop your submission file
        </p>
        <p className="text-xs text-outline mb-md">
          {ACCEPTED_EXTENSIONS.join(' / ')} · Max {MAX_SIZE_MB} MB
        </p>
        <Button variant="outline" size="sm" type="button">
          Browse files
        </Button>
      </div>

      {selectedFile && (
        <div className="mt-sm flex items-center gap-sm bg-surface-container border border-outline-variant rounded px-md py-sm text-sm">
          <span className="text-on-surface truncate flex-1">{selectedFile.name}</span>
          <span className="text-on-surface-variant shrink-0 font-mono text-xs">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </span>
          <button
            type="button"
            onClick={clearFile}
            className="text-outline hover:text-error text-xs transition-colors ml-sm"
          >
            ✕
          </button>
        </div>
      )}

      {error && <p className="mt-xs text-xs text-error">{error}</p>}
    </div>
  )
}
