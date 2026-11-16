import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import api from '../../api/api';
import ArticlePost from './ArticlePost';
import ArticleEditor from './ArticleEditor';
import { ThreadCard } from './DiscussionCard';
import { articleBlocks, articlePhotos, readMinutes, stripArticle } from '../utils/articleText';

jest.mock('../../api/api', () => ({ get: jest.fn(() => Promise.resolve({ data: [] })), post: jest.fn() }));

/** Makala (owner approved 2026-11-16): long articles. */
const body = 'watu wengi hufikiri unahitaji milioni.\n\n## Anza na bidhaa unayoijua\nChagua kitu **unachokielewa**.\n- Viatu\n- Vitenge\n> Mtaji mdogo unafundisha\n[picha 2]';
const post = { id: 9, intent: 'article', title: 'jinsi ya kuanza biashara kariakoo', body,
  media: [{ url: 'cover.jpg' }, { url: 'ndani.jpg' }], community: { id: 3, name: 'wafanya biashara kariakoo' }, createdAt: new Date().toISOString() };

beforeEach(() => { jest.clearAllMocks(); try { window.localStorage.clear(); } catch { /* none */ } });

test('layout marks become blocks; plain words and reading time without them', () => {
  expect(articleBlocks(body).map((b) => b.type)).toEqual(['p', 'h', 'p', 'ul', 'quote', 'photo']);
  expect(stripArticle('## A\n- b\n**c**')).toBe('A\nb\nc');
  expect(readMinutes('neno '.repeat(600))).toBe(3);
  expect(articlePhotos(post.media, body).cover.url).toBe('cover.jpg');
  expect(articlePhotos([{ url: 'a.jpg' }], '[picha 1]').cover).toBeNull(); // no cover: photo 1 is inside
});

test('in a list: cover, MAKALA, title, start of the text and reading time; tapping opens it', () => {
  const onOpen = jest.fn();
  render(<ArticlePost post={post} onOpen={onOpen} />);
  const card = screen.getByTestId('article-card');
  expect(within(card).getByTestId('makala-pill')).toHaveTextContent('MAKALA');
  expect(within(card).getByTestId('article-title')).toHaveTextContent('Jinsi ya kuanza biashara kariakoo');
  expect(card).toHaveTextContent('Anza na bidhaa unayoijua');
  expect(card).not.toHaveTextContent('##');
  expect(within(card).getByTestId('article-meta')).toHaveTextContent('dakika 1 kusoma · Wafanya Biashara Kariakoo');
  fireEvent.click(card);
  expect(onOpen).toHaveBeenCalled();
});

test('reading page: title, sub-headings, bold, list, quote and the photo inside', () => {
  render(<ArticlePost post={post} detail />);
  expect(screen.getByTestId('article-cover')).toHaveAttribute('src', 'cover.jpg');
  const text = screen.getByTestId('article-body');
  expect(within(text).getByRole('heading', { level: 2 })).toHaveTextContent('Anza na bidhaa unayoijua');
  expect(text.querySelector('strong')).toHaveTextContent('unachokielewa');
  expect(text.querySelectorAll('li')).toHaveLength(2);
  expect(text.querySelector('blockquote')).toHaveTextContent('Mtaji mdogo unafundisha');
  expect(text.querySelector('img')).toHaveAttribute('src', 'ndani.jpg');
  expect(screen.getByTestId('article-progress')).toBeInTheDocument();
});

test('in a community: a teal MAKALA card with its reading time', () => {
  render(<ThreadCard post={{ ...post, replyCount: 2 }} onOpen={jest.fn()} />);
  const card = screen.getByTestId('thread-9');
  expect(within(card).getByTestId('thread-kind')).toHaveTextContent('MAKALA');
  expect(within(card).getByTestId('thread-title')).toHaveTextContent('Jinsi ya kuanza biashara kariakoo');
  expect(within(card).getByTestId('thread-read-time')).toHaveTextContent('dakika 1 kusoma · majibu 2');
});

test('writing: tools add layout marks, the draft is kept, and it is published as a Makala', async () => {
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: { id: 41, intent: 'article', title: 'Jinsi ya kuanza' } });
  const onPosted = jest.fn();
  await act(async () => { render(<ArticleEditor onClose={jest.fn()} onPosted={onPosted} initialCommunityId={3} />); });
  await act(async () => { fireEvent.click(screen.getByTestId('article-publish')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Andika kichwa');
  fireEvent.change(screen.getByTestId('article-title-input'), { target: { value: 'Jinsi ya kuanza' } });
  fireEvent.change(screen.getByTestId('article-text'), { target: { value: 'Watu wengi hufikiri unahitaji milioni ili uanze biashara Kariakoo.' } });
  fireEvent.click(screen.getByTestId('tool-head'));
  expect(screen.getByTestId('article-text').value).toContain('\n## Kichwa kidogo');
  expect(screen.getByTestId('article-count')).toHaveTextContent('/ 20,000');
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  expect(JSON.parse(window.localStorage.getItem('kx_article_draft')).title).toBe('Jinsi ya kuanza');
  fireEvent.click(screen.getByTestId('article-preview'));
  expect(screen.getByTestId('article-preview-view')).toHaveTextContent('Kichwa kidogo');
  await act(async () => { fireEvent.click(screen.getByTestId('article-publish')); });
  expect(api.post).toHaveBeenCalledWith('/feed/publish', expect.objectContaining({ type: 'moment', intent: 'article', title: 'Jinsi ya kuanza', communityId: 3, visibility: 'public' }));
  expect(onPosted).toHaveBeenCalledWith(expect.objectContaining({ id: 41 }));
  expect(window.localStorage.getItem('kx_article_draft')).toBeNull();
});
