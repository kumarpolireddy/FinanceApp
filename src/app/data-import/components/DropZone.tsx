'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.sqlite', '.db'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DropZone({ onFileSelected, selectedFile, onClear }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type: ${ext}. Please upload .xlsx, .xls, .csv, or .sqlite files.`;
    }
    if (file.size > 50 * 1024 * 1024) {
      return 'File exceeds 50MB limit. Please split large files before importing.';
    }
    return null;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setDragError(null);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const error = validateFile(file);
      if (error) {
        setDragError(error);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      setDragError(error);
      return;
    }
    setDragError(null);
    onFileSelected(file);
  };

  if (selectedFile) {
    return (
      <div className="border border-border rounded-xl p-5 bg-muted/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-positive-subtle border border-positive-subtle flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet size={22} className="text-positive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{selectedFile.name}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {selectedFile.name.endsWith('.csv') ? 'CSV' : 'Excel'} File
              </span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="flex items-center gap-1 text-xs text-positive">
                <CheckCircle size={10} />
                Ready to import
              </span>
            </div>
          </div>
          <button
            onClick={onClear}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative-subtle transition-all duration-150"
            aria-label="Remove file"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'drop-zone-active'
            : 'border-border hover:border-primary/40 hover:bg-muted/10'
        }`}
        role="button"
        tabIndex={0}
        aria-label="Upload file area"
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-200 ${
            isDragging ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
          }`}
        >
          <Upload size={24} />
        </div>
        <p className="text-base font-semibold text-foreground mb-1">
          {isDragging
            ? 'Drop your Money Manager file here'
            : 'Drag & drop your Money Manager Backup (.sqlite / .db) or Excel file'}
        </p>
        <p className="text-sm text-muted-foreground mb-4 text-center">
          Upload your Money Manager SQLite database backup file (<span className="text-primary font-semibold">.sqlite / .db</span>) or Excel/CSV export
        </p>
        <div className="flex items-center gap-2 mb-4">
          {['.sqlite', '.db', '.xlsx', '.csv'].map((ext) => (
            <span
              key={`ext-${ext}`}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                ext === '.sqlite' || ext === '.db'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {ext}
            </span>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">or click to browse — max 50MB</span>
        <input
          ref={inputRef}
          type="file"
          accept=".sqlite,.db,.xlsx,.xls,.csv,application/x-sqlite3,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,*/*"
          className="hidden"
          onChange={handleFileInput}
          aria-label="File input"
        />
      </div>

      {dragError && (
        <div className="mt-3 flex items-start gap-2.5 p-3 rounded-lg bg-negative-subtle border border-negative-subtle">
          <AlertCircle size={14} className="text-negative flex-shrink-0 mt-0.5" />
          <p className="text-sm text-negative">{dragError}</p>
        </div>
      )}
    </div>
  );
}
