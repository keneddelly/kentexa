import { getStateFromPath, LinkingOptions } from '@react-navigation/native';
import { WEB_URL } from '../config';
import type { RootStackParams } from './types';

/**
 * Links (#422 N0): kentexa.com links open the right native screen; a link the app does not have
 * natively yet opens that page inside the app (Web), so a shared link never dead-ends.
 */
export const linking: LinkingOptions<RootStackParams> = {
  prefixes: ['https://kentexa.com', 'https://www.kentexa.com', 'kentexa://'],
  config: {
    screens: {
      Tabs: { path: '', screens: { Mwanzo: '', Tafuta: 'tafuta', Inbox: 'inbox', Kazi: 'kazi' } },
      Post: { path: 'post/:id', parse: { id: (v: string) => parseInt(v, 10) } },
    },
  },
  getStateFromPath(path, options) {
    const clean = path.replace(/^\/+/, '');
    if (!clean || clean.startsWith('?')) return getStateFromPath(path, options);
    const native = /^(post\/\d+|tafuta|inbox|kazi)(?:[-/?#].*)?$/.test(clean);
    if (native) return getStateFromPath(path, options);
    return { routes: [{ name: 'Tabs' }, { name: 'Web', params: { url: `${WEB_URL}/${clean}` } }] } as any;
  },
};
