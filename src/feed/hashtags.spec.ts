import { NotFoundException } from '@nestjs/common';
import { extractHashtags, hashtagKey, MAX_HASHTAGS } from './hashtags';
import { HashtagService, momentTagText } from './hashtag.service';
import { HashtagsController } from './hashtags.controller';
import { FeedService } from './feed.service';

describe('hashtag reader', () => {
  it('reads tags at the start and after spaces or brackets', () => {
    expect(extractHashtags('#Mitumba bei nzuri (#Kariakoo) na #dar_es_salaam')).toEqual([
      { key: 'mitumba', display: 'Mitumba' },
      { key: 'kariakoo', display: 'Kariakoo' },
      { key: 'dar_es_salaam', display: 'dar_es_salaam' },
    ]);
  });

  it('treats different letter case as one tag and keeps the first way it was written', () => {
    expect(extractHashtags('#Mitumba #MITUMBA #mitumba')).toEqual([{ key: 'mitumba', display: 'Mitumba' }]);
  });

  it('does not read links, words glued to #, numbers only, too short or too long', () => {
    expect(extractHashtags('kentexa.com/#juu a#b #2026 #a #' + 'x'.repeat(51))).toEqual([]);
  });

  it('allows letters with marks and other scripts', () => {
    expect(extractHashtags('#Café #नमस्ते #2026bei').map((t) => t.key)).toEqual(['café', 'नमस्ते', '2026bei']);
  });

  it('keeps at most 5 tags', () => {
    const tags = extractHashtags('#a1 #b2 #c3 #d4 #e5 #f6 #g7');
    expect(tags).toHaveLength(MAX_HASHTAGS);
    expect(tags.map((t) => t.key)).toEqual(['a1', 'b2', 'c3', 'd4', 'e5']);
  });

  it('gives the lookup key, or null when it is not a tag', () => {
    expect(hashtagKey('#Mitumba')).toBe('mitumba');
    expect(hashtagKey('ｍｉｔｕｍｂａ')).toBe('mitumba'); // NFKC: full-width letters
    expect(hashtagKey('12')).toBeNull();
    expect(hashtagKey('a b')).toBeNull();
    expect(hashtagKey(undefined)).toBeNull();
  });

  it('reads tags from the title and body of a post', () => {
    expect(momentTagText({ title: '#Bei', body: 'leo #Soko' })).toBe('#Bei\nleo #Soko');
    expect(momentTagText({ title: '#Bei', body: null })).toBe('#Bei');
  });
});

describe('HashtagService', () => {
  const build = () => {
    const calls: { sql: string; params: any[] }[] = [];
    const m = {
      query: jest.fn(async (sql: string, params: any[]) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT id FROM public.hashtag')) return params[0].map((_: string, i: number) => ({ id: i + 10 }));
        return [];
      }),
    };
    const ds: any = {
      transaction: jest.fn(async (fn: any) => fn(m)),
      query: jest.fn(async () => []),
    };
    return { svc: new HashtagService(ds), ds, calls };
  };

  it('saves the tags of a post and drops the ones no longer in its text', async () => {
    const { svc, calls } = build();
    expect(await svc.sync('moment', 7, '#Mitumba na #Soko')).toBe(2);
    const insertTags = calls.find((c) => c.sql.includes('INSERT INTO public.hashtag ('));
    expect(insertTags!.params).toEqual([['mitumba', 'soko'], ['Mitumba', 'Soko']]);
    const del = calls.find((c) => c.sql.includes('DELETE FROM public.hashtag_usage'));
    expect(del!.params).toEqual(['moment', 7, [10, 11]]);
    const use = calls.find((c) => c.sql.includes('INSERT INTO public.hashtag_usage'));
    expect(use!.params).toEqual([[10, 11], 'moment', 7]);
  });

  it('clears all tags when the edited text has none', async () => {
    const { svc, calls } = build();
    expect(await svc.sync('moment', 7, 'hakuna tagi')).toBe(0);
    expect(calls.map((c) => c.sql).some((s) => s.includes('INSERT'))).toBe(false);
    expect(calls.find((c) => c.sql.includes('DELETE'))!.params).toEqual(['moment', 7, []]);
  });

  it('never throws when saving fails, so publishing goes on', async () => {
    const { svc, ds } = build();
    ds.transaction.mockRejectedValue(new Error('no table'));
    await expect(svc.sync('moment', 7, '#Mitumba')).resolves.toBe(0);
    ds.query.mockRejectedValue(new Error('no table'));
    await expect(svc.remove('moment', 7)).resolves.toBeUndefined();
  });

  it('suggests by the start of the tag, with _ and % taken literally', async () => {
    const { svc, ds } = build();
    ds.query.mockResolvedValue([{ key: 'mitumba', display: 'Mitumba', postCount: '4' }]);
    expect(await svc.suggest('#Mit')).toEqual([{ key: 'mitumba', display: 'Mitumba', postCount: 4 }]);
    expect(ds.query.mock.calls[0][1][0]).toBe('mit%');
    await svc.suggest('dar_');
    expect(ds.query.mock.calls[1][1][0]).toBe('dar\\_%');
    expect(await svc.suggest('a b')).toEqual([]);
    expect(await svc.suggest('')).toEqual([]);
  });

  it('shows a blocked tag with no posts', async () => {
    const { svc, ds } = build();
    ds.query.mockResolvedValue([{ key: 'mbaya', display: 'Mbaya', status: 'blocked', postCount: 9 }]);
    expect(await svc.info('mbaya')).toEqual({ key: 'mbaya', display: 'Mbaya', blocked: true, postCount: 0 });
  });

  it('blocks a tag by its key, even one nobody used yet', async () => {
    const { svc, ds } = build();
    expect(await svc.setBlocked('#Mbaya', true)).toEqual({ key: 'mbaya', status: 'blocked' });
    expect(ds.query.mock.calls[0][1]).toEqual(['mbaya', 'blocked']);
    await expect(svc.setBlocked('1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('backfills old posts in batches by id', async () => {
    const { svc, ds } = build();
    ds.query
      .mockResolvedValueOnce([{ id: 1, title: '#Soko', body: null }, { id: 2, title: 'bila', body: null }])
      .mockResolvedValueOnce([]);
    expect(await svc.backfill(2)).toEqual({ posts: 2, tagged: 1 });
    expect(ds.query.mock.calls[1][1]).toEqual([2, 2]);
  });
});

describe('HashtagsController', () => {
  it('reads a tag page under the viewer and the chosen order', async () => {
    const cvs: any = { getHashtagPosts: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const ctl = new HashtagsController({} as any, cvs);
    await ctl.posts('Mitumba', { user: { id: 5 } }, 'latest', '2');
    expect(cvs.getHashtagPosts).toHaveBeenCalledWith('mitumba', 5, 'latest', 2);
    await ctl.posts('mitumba', {}, undefined, undefined);
    expect(cvs.getHashtagPosts).toHaveBeenLastCalledWith('mitumba', null, 'top', 1);
    await expect(ctl.posts('12', {}, undefined, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 0 posts for a tag nobody used yet', async () => {
    const ctl = new HashtagsController({ info: jest.fn().mockResolvedValue(null) } as any, {} as any);
    expect(await ctl.info('Mpya')).toEqual({ key: 'mpya', display: 'Mpya', blocked: false, postCount: 0 });
  });
});

describe('FeedService keeps tags in step with posts', () => {
  const build = () => {
    const svc: any = Object.create(FeedService.prototype);
    svc.hashtags = { sync: jest.fn().mockResolvedValue(1), remove: jest.fn().mockResolvedValue(undefined) };
    svc.activityEvents = { record: jest.fn() };
    svc.searchIndex = { upsert: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    return svc;
  };

  it('re-reads tags when the text is edited', async () => {
    const svc = build();
    svc.feedRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, businessId: 1, isActive: true, createdAt: new Date(), title: 'zamani', body: null, visibility: 'public' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    await svc.editPost(1, 7, { title: 'mpya #Soko' });
    expect(svc.hashtags.sync).toHaveBeenCalledWith('moment', 7, 'mpya #Soko');
  });

  it('does not touch tags when only who can see the post changes', async () => {
    const svc = build();
    svc.feedRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, businessId: 1, isActive: true, createdAt: new Date(), title: '#Soko', visibility: 'public' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    await svc.editPost(1, 7, { visibility: 'followers' });
    expect(svc.hashtags.sync).not.toHaveBeenCalled();
  });

  it('removes the tags of a deleted post', async () => {
    const svc = build();
    svc.feedRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    await svc.deletePost(1, 7);
    expect(svc.hashtags.remove).toHaveBeenCalledWith('moment', 7);
  });
});
