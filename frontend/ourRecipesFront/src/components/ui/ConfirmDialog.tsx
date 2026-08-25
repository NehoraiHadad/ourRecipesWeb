'use client';

import { ReactNode } from 'react';
import Modal from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { cn } from '@/utils/cn';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Defaults to true — most confirmations here are deletes. */
  destructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Shared confirmation dialog (Stage F, F2+F4).
 *
 * Wraps the generic `Modal` so every management surface (places, menus,
 * recipes) asks for confirmation the same way, instead of each page
 * hand-rolling its own modal or falling back to `window.confirm`.
 */
export default function ConfirmDialog({
  isOpen,
  title = 'אישור פעולה',
  message,
  confirmLabel = 'מחק',
  cancelLabel = 'ביטול',
  destructive = true,
  isLoading = false,
  onConfirm,
  onClose
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnOutsideClick={!isLoading}
      showCloseButton={!isLoading}
    >
      <div className="space-y-4">
        {typeof message === 'string' ? <Typography variant="body">{message}</Typography> : message}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            isLoading={isLoading}
            className={cn(destructive && 'bg-red-600 hover:bg-red-700 text-white')}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
