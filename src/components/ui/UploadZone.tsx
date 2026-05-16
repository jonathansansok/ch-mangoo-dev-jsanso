'use client';

import { useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';

export interface UploadZoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  accept: string;
  maxSize: number;
  disabled?: boolean;
}

export function UploadZone({ file, onChange, accept, maxSize, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(next: File | null) {
    setError(null);
    if (next && next.size > maxSize) {
      setError(`Tamaño máximo ${(maxSize / 1024 / 1024).toFixed(0)}MB`);
      return;
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border-2 border-dashed px-6 py-10 text-sm transition-colors"
        style={{
          borderColor: dragOver ? 'var(--company-primary)' : '#d1d5db',
          backgroundColor: dragOver ? '#f5f3ff' : '#fafafa',
        }}
      >
        {file ? (
          <>
            <FileText className="h-8 w-8 text-[#2f458a]" />
            <span className="font-medium text-[#1f2937]">{file.name}</span>
            <span className="text-xs text-[#65758b]">{(file.size / 1024).toFixed(1)} KB</span>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-[#65758b]" />
            <span className="font-medium text-[#1f2937]">Arrastrá un PDF acá o hacé click</span>
            <span className="text-xs text-[#65758b]">Hasta 10MB</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <button
          type="button"
          onClick={() => handleFile(null)}
          className="inline-flex items-center gap-1 self-start text-xs text-[#65758b] hover:text-[#1f2937]"
        >
          <X className="h-3 w-3" /> Quitar archivo
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
