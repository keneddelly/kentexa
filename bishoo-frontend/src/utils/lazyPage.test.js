import React, { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import lazyPage, { PageLoading } from './lazyPage';

test('a page that downloads shows KenteXa and "Inafungua" meanwhile, then the page', async () => {
  let resolve;
  const Page = lazyPage(() => new Promise((r) => { resolve = r; }));
  render(<Suspense fallback={<PageLoading />}><Page /></Suspense>);
  expect(screen.getByTestId('page-loading')).toHaveTextContent('Inafungua');
  resolve({ default: () => <div>Ukurasa</div> });
  expect(await screen.findByText('Ukurasa')).toBeInTheDocument();
});

test('a failed download is tried once more before anything else', async () => {
  jest.useFakeTimers();
  const load = jest.fn().mockRejectedValueOnce(new Error('ChunkLoadError')).mockResolvedValue({ default: () => <div>Imefika</div> });
  const Page = lazyPage(load);
  render(<Suspense fallback={<PageLoading />}><Page /></Suspense>);
  await Promise.resolve(); await Promise.resolve();
  jest.advanceTimersByTime(1600);
  jest.useRealTimers();
  expect(await screen.findByText('Imefika')).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
});

test('the first screen is in index.html itself, so a slow line never shows a blank page', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  const root = html.slice(html.indexOf('<div id="root">'), html.indexOf('<div id="kx-boot-msg"'));
  expect(root).toContain('KenteXa');
  expect(root).toContain('Inafungua');
});

test('the offline-first pages stay in the first download; most pages download when opened', () => {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.js'), 'utf8');
  for (const name of ['HomeFeed', 'PublicLogin', 'Register', 'POS']) {
    expect(app).toMatch(new RegExp(`^import ${name}\\s+from`, 'm'));
  }
  expect((app.match(/lazyPage\(\(\) => import\(/g) || []).length).toBeGreaterThan(100);
});

test('the service worker never keeps a web page as a script', () => {
  const sw = fs.readFileSync(path.join(process.cwd(), 'public', 'service-worker.js'), 'utf8');
  expect(sw).toContain("!type.includes('text/html')");
});
