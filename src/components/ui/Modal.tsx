'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  presentation?: 'fullscreen' | 'sheet' | 'dialog';
}

const sizeClasses = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  presentation = 'fullscreen',
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleAppBack = (event: Event) => {
        event.preventDefault();
        onClose();
      };
      window.addEventListener('app-back', handleAppBack);
      return () => {
        window.removeEventListener('app-back', handleAppBack);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSheet = presentation === 'sheet';
  const isDialog = presentation === 'dialog';

  return (
    <div
      className={`fixed inset-0 z-[100] flex justify-center p-0 sm:items-center sm:p-4 ${
        isSheet ? 'items-end' : isDialog ? 'items-center px-4' : 'items-stretch'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm fade-in ${
          isSheet || isDialog ? 'block' : 'hidden sm:block'
        }`}
        onClick={onClose}
      />
      <div
        className={`relative flex w-full max-w-none flex-col overflow-hidden slide-up ${
          isSheet
            ? 'h-auto max-h-[70dvh] rounded-t-2xl border border-b-0 border-border bg-card shadow-2xl'
            : isDialog
              ? 'h-auto max-h-[70dvh] !w-[280px] !max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl'
            : 'h-[100dvh] rounded-none border-0 bg-background shadow-none'
        } sm:h-auto ${sizeClasses[size]} sm:max-h-[90vh] sm:bg-card sm:border sm:border-border sm:rounded-2xl sm:shadow-card-lg`}
      >
        <div className={`flex items-start justify-between border-b border-border bg-card shrink-0 ${
          isSheet || isDialog ? 'px-4 py-3' : 'px-4 py-4 sm:p-6'
        }`}>
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 flex-shrink-0 ml-4"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>
        <div className={`flex-1 overflow-y-auto min-h-0 sm:max-h-[calc(90vh-120px)] ${
          isSheet
            ? 'p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
            : isDialog
              ? 'p-3'
              : 'p-4 sm:p-6'
        }`}>
          {children}
        </div>
      </div>
    </div>
  );
}
