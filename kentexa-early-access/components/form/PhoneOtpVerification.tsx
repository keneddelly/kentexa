'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ApiError, sendPhoneOtp, verifyPhoneOtp } from '@/lib/apiClient';
import type { RegistrationFormValues } from '@/lib/formSchema';

interface Props {
  form: UseFormReturn<RegistrationFormValues>;
}

type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

export default function PhoneOtpVerification({ form }: Props) {
  const { watch, setValue } = form;
  const phone = watch('phone');

  const [status, setStatus] = useState<Status>('idle');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const verifiedPhoneRef = useRef<string | null>(null);

  // If the user edits the phone after verifying, verification no longer applies.
  useEffect(() => {
    if (status === 'verified' && phone !== verifiedPhoneRef.current) {
      setStatus('idle');
      setOtp('');
      setValue('phoneVerified', false, { shouldValidate: true });
    }
  }, [phone, status, setValue]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const canSend = phone && phone.trim().length >= 7;

  const handleSend = async () => {
    if (!canSend) {
      toast.error('Enter a valid phone number first.');
      return;
    }
    setStatus('sending');
    try {
      const res = await sendPhoneOtp(phone.trim());
      setStatus('sent');
      setCooldown(60);
      if (res.devOtp) toast.success(`Dev mode — code: ${res.devOtp}`);
      else toast.success('Verification code sent.');
    } catch (err) {
      setStatus('idle');
      toast.error(err instanceof ApiError ? err.message : 'Could not send code. Try again.');
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      toast.error('Enter the 6-digit code.');
      return;
    }
    setStatus('verifying');
    try {
      await verifyPhoneOtp(phone.trim(), otp);
      verifiedPhoneRef.current = phone;
      setStatus('verified');
      setValue('phoneVerified', true, { shouldValidate: true });
      toast.success('Phone verified!');
    } catch (err) {
      setStatus('sent');
      toast.error(err instanceof ApiError ? err.message : 'Verification failed. Try again.');
    }
  };

  if (status === 'verified') {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
        <span>✅</span> Phone number verified
      </div>
    );
  }

  if (status === 'idle' || status === 'sending') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSend}
        isLoading={status === 'sending'}
        disabled={!canSend}
      >
        Send verification code
      </Button>
    );
  }

  // status === 'sent' | 'verifying'
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Input
        placeholder="6-digit code"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="sm:w-40"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleVerify} isLoading={status === 'verifying'}>
          Verify
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSend}
          disabled={cooldown > 0 || status === 'verifying'}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </div>
    </div>
  );
}
