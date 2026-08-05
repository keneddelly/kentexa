'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { ADMIN_USER_KEY, ApiError, adminLogin, getAdminToken, setAdminToken } from '@/lib/apiClient';

const AUTHORIZED_ROLES = ['admin', 'manager'];

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (getAdminToken()) {
      router.replace('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error('Please enter your login and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await adminLogin(identifier.trim(), password);
      // eslint-disable-next-line no-console
      console.log('Admin login response:', response);

      const token = response.access_token;
      if (!token) {
        toast.error('Login succeeded but no access token was returned. Check the console for the raw response.');
        return;
      }

      setAdminToken(token);
      if (typeof window !== 'undefined' && response.user) {
        window.localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(response.user));
      }

      const role = response.user?.role?.toLowerCase();
      if (role && !AUTHORIZED_ROLES.includes(role)) {
        toast.error('You are logged in, but only Admin or Manager accounts can access the Early Access dashboard.');
        // Keep the token so the layout can still surface a proper 403 message
        // if they try to hit an admin endpoint directly.
      } else {
        toast.success('Welcome back!');
      }
      router.push('/admin');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) {
          toast.error('Incorrect login or password.');
        } else {
          err.messages.forEach((m) => toast.error(m));
        }
      } else {
        toast.error('Could not reach the server. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-2xl font-bold text-primary dark:text-primary-light">
            Kentexa
          </Link>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Early Access Admin</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Phone or Email"
              required
              placeholder="e.g. admin@kentexa.co.tz"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" fullWidth isLoading={isSubmitting}>
              Sign In
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          Only Admin or Manager accounts on the main Kentexa system can access this dashboard.
        </p>
      </div>
    </main>
  );
}
