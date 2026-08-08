'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';

function formatEarlyAccessId(id: string): string {
  const numeric = id.replace(/\D/g, '');
  if (!numeric) return `KTX-EA-${id}`;
  return `KTX-EA-${numeric.padStart(6, '0')}`;
}

export default function SuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [copied, setCopied] = useState(false);
  const earlyAccessId = formatEarlyAccessId(id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(earlyAccessId);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — please copy it manually.');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-16 dark:bg-gray-900">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-9 w-9 text-green-600 dark:text-green-400">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Congratulations!</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">Your registration has been received.</p>
        <p className="mt-1 text-gray-600 dark:text-gray-300">
          You are now part of the Kentexa Early Access Program.
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          We will contact you before your profile is published.
        </p>

        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Your Early Access ID
          </p>
          <button
            onClick={handleCopy}
            className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-4 text-2xl font-extrabold tracking-wider text-primary transition-colors hover:bg-primary/10 dark:border-primary-light/40 dark:bg-primary-light/10 dark:text-primary-light"
          >
            {earlyAccessId}
          </button>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {copied ? 'Copied!' : 'Tap to copy'}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button variant="outline" fullWidth>
              Back to Home
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="ghost" fullWidth>
              Register Another Business
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
