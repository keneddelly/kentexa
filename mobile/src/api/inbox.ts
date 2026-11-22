import { api } from './client';

/**
 * Inbox (N2, owner approved the native plan 2026-11-17). The same endpoints the web inbox uses:
 * "buyer" = chats you started with shops (my-conversations), "seller" = your business inbox.
 */
export type InboxMode = 'buyer' | 'seller';

export type Convo = {
  id: number;
  _mode: InboxMode;
  title: string;
  photo: string | null;
  preview: string;
  lastAt: string | null;
  unread: number;
};

export type Msg = {
  id: number;
  content: string | null;
  imageUrl?: string | null;
  isNote?: boolean;
  createdAt?: string;
  senderType?: string;
  _status?: 'sending' | 'failed';
};

const BASE: Record<InboxMode, string> = {
  buyer: '/business/my-conversations',
  seller: '/business/inbox',
};

const titleOf = (c: any, mode: InboxMode) => (mode === 'buyer'
  ? (c.commerceProfile?.displayName || c.seller?.storeName || c.seller?.name || 'Muuzaji')
  : (c.customer?.name || 'Mteja'));

const toConvo = (c: any, mode: InboxMode): Convo => ({
  id: c.id,
  _mode: mode,
  title: titleOf(c, mode),
  photo: mode === 'buyer' ? c.commerceProfile?.photoUrl || null : null,
  preview: c.lastMessagePreview || '',
  lastAt: c.lastMessageAt || null,
  unread: Number((mode === 'buyer' ? c.buyerUnreadCount : c.unreadCount) || 0),
});

/** Both lists at once; a list the account is not allowed to see is simply left out. */
export async function listConvos(): Promise<Convo[]> {
  const [mine, biz] = await Promise.allSettled([
    api.get(`${BASE.buyer}`, { limit: 30 }),
    api.get(`${BASE.seller}`, { limit: 30 }),
  ]);
  const out: Convo[] = [];
  if (biz.status === 'fulfilled') out.push(...(biz.value?.conversations || []).map((c: any) => toConvo(c, 'seller')));
  if (mine.status === 'fulfilled') out.push(...(mine.value?.conversations || []).map((c: any) => toConvo(c, 'buyer')));
  return out.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
}

export async function listMessages(mode: InboxMode, id: number, before?: number) {
  const r = await api.get(`${BASE[mode]}/${id}/messages`, before ? { before } : undefined);
  return { messages: (r?.messages || []) as Msg[], hasMore: !!r?.hasMore, title: r?.conversation ? titleOf(r.conversation, mode) : null };
}

export async function sendMessage(mode: InboxMode, id: number, content: string): Promise<Msg> {
  return api.post(`${BASE[mode]}/${id}/messages`, mode === 'buyer' ? { content } : { content, isNote: false });
}

/** Messages sent by the person themselves, the same rule the web uses. */
export const isMine = (m: Msg, mode: InboxMode) => (mode === 'buyer'
  ? m.senderType === 'customer'
  : m.senderType === 'seller' || m.senderType === 'employee');
