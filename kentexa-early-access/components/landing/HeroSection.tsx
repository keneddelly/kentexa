import Link from 'next/link';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function HeroSection() {
  return (
    <header className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-white to-white dark:from-primary/10 dark:via-gray-900 dark:to-gray-900">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-xl font-bold text-primary dark:text-primary-light">Kentexa</span>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/login"
            className="text-sm font-medium text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary-light"
          >
            Admin
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <span className="mb-4 inline-block rounded-full bg-accent/10 px-4 py-1 text-sm font-semibold text-accent">
          Early Access — Tanzania
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
          Join Kentexa Before Launch
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
          Become one of the first businesses, service providers, transporters, and agents on
          Tanzania&apos;s next AI-powered marketplace.
        </p>
        <Link
          href="/register"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/30 transition-transform hover:-translate-y-0.5 hover:bg-accent-dark"
        >
          Register Free
        </Link>
      </div>
    </header>
  );
}
