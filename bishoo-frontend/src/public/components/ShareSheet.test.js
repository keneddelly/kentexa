import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import ShareSheet, { suggestedMessage, channelUrl } from './ShareSheet';

jest.mock('../../api/api', () => ({ post: jest.fn() }));

const links = {
  whatsapp: 'https://kentexa.com/s/Wha1234', status: 'https://kentexa.com/s/Sta1234', facebook: 'https://kentexa.com/s/Fac1234',
  telegram: 'https://kentexa.com/s/Tel1234', x: 'https://kentexa.com/s/Xxx1234', copy: 'https://kentexa.com/s/Cop1234',
  native: 'https://kentexa.com/s/Nat1234', image: 'https://kentexa.com/s/Img1234', instagram: 'https://kentexa.com/s/Ins1234',
};
const props = { open: true, onClose: jest.fn(), contentType: 'post', contentId: 88, words: 'Biashara gani kwa mtaji wa 100,000?', intent: 'question',
  community: 'Wafanyabiashara Kariakoo', replies: 12, plainUrl: 'https://kentexa.com/post/88' };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) });
  window.open = jest.fn();
});

test('C10: suggested messages fit the kind, in Kiswahili or English', () => {
  expect(suggestedMessage({ contentType: 'post', intent: 'question', words: 'Bei gani?', community: 'Kariakoo' }))
    .toBe('Unaweza kujibu hili? Bei gani? Watu wa Kariakoo wanajadili. Jibu hapa:');
  expect(suggestedMessage({ contentType: 'post', intent: 'poll', words: 'Siku gani?' })).toBe('Unaonaje? Piga kura: Siku gani?');
  expect(suggestedMessage({ contentType: 'community', words: 'Wakulima', purpose: 'Mvua na mbegu' })).toBe('Jiunge na Wakulima kwenye KenteXa: Mvua na mbegu');
  expect(suggestedMessage({ contentType: 'post', intent: 'question', words: 'Price?' }, 'en')).toBe('Can you answer this? Price? Answer here:');
});

test('C10: each channel opens its own place with its own link', () => {
  expect(channelUrl('whatsapp', 'Habari', 'https://kentexa.com/s/A')).toBe('https://wa.me/?text=Habari%20https%3A%2F%2Fkentexa.com%2Fs%2FA');
  expect(channelUrl('facebook', 'x', 'https://kentexa.com/s/A')).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fkentexa.com%2Fs%2FA');
  expect(channelUrl('telegram', 'Hi', 'u')).toBe('https://t.me/share/url?url=u&text=Hi');
  expect(channelUrl('x', 'Hi', 'u')).toBe('https://twitter.com/intent/tweet?text=Hi&url=u');
  expect(channelUrl('copy', 'Hi', 'u')).toBeNull();
});

test('C10: the sheet makes every link at once; the edited message goes to WhatsApp with its link', async () => {
  api.post.mockResolvedValue({ data: { links } });
  const onShared = jest.fn();
  await act(async () => { render(<ShareSheet {...props} onShared={onShared} />); });
  expect(api.post).toHaveBeenCalledWith('/share-links', { contentType: 'post', contentId: 88, channels: expect.arrayContaining(['whatsapp', 'status', 'image']) });
  expect(screen.getByTestId('share-link')).toHaveTextContent('kentexa.com/s/Cop1234 · majibu 12');
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/share/card/post/88.png?f=status&s=Sta1234'));
  fireEvent.change(screen.getByTestId('share-message'), { target: { value: 'Jibu hili' } });
  fireEvent.click(screen.getByTestId('share-whatsapp'));
  expect(window.open).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent('Jibu hili https://kentexa.com/s/Wha1234')}`, '_blank', 'noopener');
  expect(onShared).toHaveBeenCalledWith('whatsapp');
});

test('C10: English, and the language switch rewrites the suggestion', async () => {
  api.post.mockResolvedValue({ data: { links } });
  await act(async () => { render(<ShareSheet {...props} />); });
  fireEvent.click(screen.getByTestId('share-lang-en'));
  expect(screen.getByTestId('share-message').value).toMatch(/^Can you answer this\?/);
});

test('C10: the Status button sends the Status card picture through the phone', async () => {
  api.post.mockResolvedValue({ data: { links } });
  const share = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  await act(async () => { render(<ShareSheet {...props} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { fireEvent.click(screen.getByTestId('share-status')); });
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)], text: expect.stringContaining('https://kentexa.com/s/Sta1234') }));
  // A picture Status has no tappable link on WhatsApp: the link is offered as a text Status next.
  expect(screen.getByTestId('share-status-link')).toHaveTextContent('Weka link kwenye Status');
  await act(async () => { fireEvent.click(screen.getByTestId('share-status-link-go')); });
  expect(share).toHaveBeenLastCalledWith({ text: expect.stringContaining('https://kentexa.com/s/Sta1234') });
  expect(screen.queryByTestId('share-status-link')).toBeNull();
  delete navigator.share; delete navigator.canShare;
});

test('C10: members-only content: no outside channels, only copying its normal address', async () => {
  api.post.mockRejectedValue({ response: { status: 400 } });
  await act(async () => { render(<ShareSheet {...props} />); });
  expect(screen.getByTestId('share-members-only')).toBeInTheDocument();
  expect(screen.queryByTestId('share-whatsapp')).toBeNull();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockResolvedValue() }, configurable: true });
  await act(async () => { fireEvent.click(screen.getByTestId('share-copy')); });
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('https://kentexa.com/post/88'));
});

test('Instagram Story: the tall card goes to the phone, the link is copied and the Link sticker explained', async () => {
  api.post.mockResolvedValue({ data: { links } });
  const share = jest.fn().mockResolvedValue(undefined);
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  await act(async () => { render(<ShareSheet {...props} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/share/card/post/88.png?f=status&s=Ins1234'));
  await act(async () => { fireEvent.click(screen.getByTestId('share-instagram')); });
  expect(writeText).toHaveBeenCalledWith('https://kentexa.com/s/Ins1234');
  expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
  expect(screen.getByTestId('share-note')).toHaveTextContent('sticker ya Link');
  expect(screen.getByTestId('share-facebook-hint')).toHaveTextContent('Page au Group');
  // Facebook takes only the link: the message is copied to paste as the caption on top.
  writeText.mockClear();
  await act(async () => { fireEvent.click(screen.getByTestId('share-facebook')); });
  expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Unaweza kujibu hili\?/));
  expect(screen.getByTestId('share-note')).toHaveTextContent('juu ya link');
  delete navigator.share; delete navigator.canShare; delete navigator.clipboard;
});

test('on a phone the app opens in place (no new tab), so the person comes back to the post', async () => {
  api.post.mockResolvedValue({ data: { links } });
  const ua = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile');
  const share = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  delete window.location; window.location = { href: 'https://kentexa.com/post/88', origin: 'https://kentexa.com' };
  await act(async () => { render(<ShareSheet {...props} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('share-whatsapp')); });
  expect(window.open).not.toHaveBeenCalled();
  expect(window.location.href).toBe(`https://wa.me/?text=${encodeURIComponent(`${screen.getByTestId('share-message').value} https://kentexa.com/s/Wha1234`)}`);
  await act(async () => { fireEvent.click(screen.getByTestId('share-facebook')); });
  expect(share).toHaveBeenCalledWith({ text: expect.any(String), url: 'https://kentexa.com/s/Fac1234' });
  ua.mockRestore(); delete navigator.share;
});
