export default function Footer() {
  return (
    <footer className="border-t border-gray-200 py-8 dark:border-gray-800">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-gray-500 dark:text-gray-400 sm:flex-row">
        <span>© {new Date().getFullYear()} Kentexa. All rights reserved.</span>
        <span>Made for Tanzania&apos;s businesses, service providers, transporters &amp; agents.</span>
      </div>
    </footer>
  );
}
