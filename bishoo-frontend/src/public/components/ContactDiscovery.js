import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const BLUE = '#1d9bf0';
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';

const ContactDiscovery = ({ compact = false }) => {
  const translation = useTranslation() || {};
  const language = translation.i18n?.language || 'en';
  const sw = language.toLowerCase().startsWith('sw');
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState('');
  const [following, setFollowing] = useState(new Set());
  const [followingInProgress, setFollowingInProgress] = useState(new Set());

  const pickerSupported = typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    !!navigator.contacts &&
    typeof navigator.contacts.select === 'function';

  const findContacts = async () => {
    if (!pickerSupported) {
      setNotice(sw
        ? 'Uchaguzi wa contacts haupatikani kwenye kivinjari hiki. Jaribu Chrome kwenye Android.'
        : 'Contact selection is not available in this browser. Try Chrome on Android.');
      return;
    }

    try {
      setLoading(true);
      setNotice('');
      setSearched(false);
      setMatches([]);
      // The browser opens the native contact picker only after this tap.
      // Only numbers the user selects are sent; the address book is not stored.
      const selected = await navigator.contacts.select(['tel'], { multiple: true });
      const phoneNumbers = [...new Set(
        (selected || []).flatMap((contact) => {
          const values = Array.isArray(contact.tel) ? contact.tel : [contact.tel];
          return values.filter((value) => typeof value === 'string' && value.trim());
        }),
      )].slice(0, 200);

      if (!phoneNumbers.length) {
        setSearched(true);
        setNotice(sw ? 'Hakuna namba zilizochaguliwa.' : 'No phone numbers were selected.');
        return;
      }

      const response = await api.post('/stores/discover-contacts', { phoneNumbers });
      const found = response.data?.matches || [];
      setMatches(found);
      setFollowing(new Set(found.filter((person) => person.isFollowing).map((person) => person.id)));
      setSearched(true);
      setNotice(found.length
        ? (sw ? `Tumepata watu ${found.length} unaowafahamu kwenye Kentexa.` : `Found ${found.length} people you may know on Kentexa.`)
        : (sw ? 'Hakuna akaunti zinazolingana na contacts ulizochagua.' : 'No matching Kentexa accounts were found in the selected contacts.'));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setNotice(error?.response?.data?.message || (sw
        ? 'Imeshindikana kuangalia contacts kwa sasa. Tafadhali jaribu tena.'
        : 'We could not check your contacts right now. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const followPerson = async (person) => {
    if (following.has(person.id) || followingInProgress.has(person.id)) return;
    setFollowingInProgress((previous) => new Set([...previous, person.id]));
    try {
      const response = await api.post(`/profiles/${person.id}/follow`);
      if (response.data?.following === true) {
        setFollowing((previous) => new Set([...previous, person.id]));
      } else {
        setNotice(sw ? 'Huwezi kumfuata mtu huyu kwa sasa.' : 'You could not follow this profile. Please try again.');
      }
    } catch {
      setNotice(sw ? 'Imeshindikana kumfuata. Jaribu tena.' : 'Could not follow this profile. Please try again.');
    } finally {
      setFollowingInProgress((previous) => {
        const next = new Set(previous);
        next.delete(person.id);
        return next;
      });
    }
  };

  return (
    <section aria-label={sw ? 'Tafuta watu unaowafahamu' : 'Find people you know'}
      style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: compact ? 14 : 18,
        margin: '0 0 14px', background: '#fff', color: INK }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 5px', fontSize: compact ? 16 : 19, lineHeight: 1.3, fontWeight: 800 }}>
            {sw ? 'Tafuta watu unaowafahamu' : 'Find people you know'}
          </h2>
          <p style={{ margin: 0, color: MUTED, fontSize: 14, lineHeight: 1.5 }}>
            {sw
              ? 'Gundua watu kutoka kwenye contacts zako ambao tayari wanatumia Kentexa.'
              : 'Discover people from your contacts who are already using Kentexa.'}
          </p>
        </div>
      </div>

      <button type="button" onClick={findContacts} disabled={loading}
        style={{ width: '100%', minHeight: 44, marginTop: 13, padding: '10px 16px',
          border: 'none', borderRadius: 10, background: loading ? '#e8eef2' : BLUE,
          color: loading ? MUTED : '#fff', fontSize: 14, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
        {loading ? (sw ? 'Inaangalia...' : 'Checking...') : searched
          ? (sw ? 'Jaribu tena' : 'Try again')
          : (sw ? 'Chagua contacts' : 'Choose contacts')}
      </button>

      <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
        {sw
          ? 'Ni namba utakazochagua tu zitakazotumika. Hatuhifadhi address book yako. Hatua hii ni ya hiari.'
          : 'Only numbers you select are checked. We do not store your address book. This is optional.'}
      </p>

      {notice && <p role="status" style={{ margin: '10px 0 0', color: MUTED, fontSize: 13, lineHeight: 1.5 }}>{notice}</p>}

      {matches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
          {matches.map((person) => {
            const isFollowing = following.has(person.id);
            const busy = followingInProgress.has(person.id);
            const name = person.displayName || (sw ? 'Mtumiaji wa Kentexa' : 'Kentexa user');
            return (
              <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderTop: `1px solid ${LINE}` }}>
                <div style={{ width: 40, height: 40, flexShrink: 0, overflow: 'hidden',
                  borderRadius: '50%', background: '#e8f4fd', color: BLUE,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                  {person.photoUrl
                    ? <img src={person.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : name.trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {person.username ? `@${person.username}` : person.location || ''}
                  </div>
                </div>
                <button type="button" onClick={() => followPerson(person)} disabled={isFollowing || busy}
                  style={{ minHeight: 34, padding: '0 13px', borderRadius: 18,
                    border: isFollowing ? `1px solid ${LINE}` : 'none',
                    background: isFollowing || busy ? '#f5f7f8' : BLUE,
                    color: isFollowing || busy ? MUTED : '#fff',
                    fontSize: 12, fontWeight: 700, cursor: isFollowing || busy ? 'default' : 'pointer',
                    fontFamily: 'inherit' }}>
                  {isFollowing ? (sw ? 'Unafuata' : 'Following') : busy ? (sw ? 'Inapakia' : 'Following') : (sw ? 'Fuata' : 'Follow')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ContactDiscovery;
