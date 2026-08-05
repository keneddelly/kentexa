'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface RejectReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting?: boolean;
}

export default function RejectReasonModal({ isOpen, onClose, onConfirm, isSubmitting }: RejectReasonModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (reason.trim().length < 5) {
      setError('Please provide a reason of at least 5 characters.');
      return;
    }
    setError('');
    onConfirm(reason.trim());
  };

  const handleClose = () => {
    setReason('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Reject registration">
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Please provide a reason for rejecting this registration. This may be shared with the
        applicant.
      </p>
      <TextArea
        label="Rejection Reason"
        required
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirm} isLoading={isSubmitting}>
          Reject Registration
        </Button>
      </div>
    </Modal>
  );
}
