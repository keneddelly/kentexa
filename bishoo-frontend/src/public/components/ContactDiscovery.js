import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const BLUE = '#2563EB';
const DARK = '#0F172A';
const MUTED = '#64748B';

const ContactDiscovery = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const sw = (i18n.language || '').toLowerCase().startsWith('sw');
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
        ? 'Ufunguzi wa contacts haupatikani kwenye kivinjari hiki. Jaribu Kentexa kupitia Chrome kwenye Android.'
        : 'Contact selection is not supported in this browser. Try opening Kentexa in Chrome on Android.');
      return;
    }

    try {
      setLoading(true);
      setSearched(false);
      setMatches([]);
      setNotice('');
      // The browser opens its native contact picker only after this user action.
      // Only the selected phone numbers are sent; the address book is not saved.
      const selected = await navigator.contacts.select(['tel'], { multiple: true });
      const phoneNumbers = [...new Set(
        (selected || []).flatMap(contact => {
          const values = Array.isArray(contact.tel) ? contact.tel : [contact.tel];
          return values.filter(value => typeof value === 'string' && value.trim());
        }),
      )].slice(0, 200);

      if (!phoneNumbers.length) {
        setMatches([]);
        setSearched(true);
        setNotice(sw ? 'Hakuna namba zilizochaguliwa.' : 'No phone numbers were selected.');
        return;
      }

      const response = await api.post('/stores/discover-contacts', { phoneNumbers });
      const found = response.data?.matches || [];
      setMatches(found);
      setFollowing(new Set(found.filter(person => person.isFollowing).map(person => person.id)));
      setSearched(true);
      setNotice(found.length
        ? (sw ? `Tumepata watu ${found.length} unaowafahamu kwenye Kentexa.` : `Found ${found.length} people you may know on Kentexa.`)
        : (sw ? 'Bado hatujapata mtu kutoka kwenye contacts ulizochagua.' : 'No matching Kentexa accounts were found in the selected contacts.'));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      const message = error?.response?.data?.message;
      setNotice(message || (sw
        ? 'Imeshindikana kuangalia contacts kwa sasa. Tafadhali jaribu tena baadaye.'
        : 'We could not check your contacts right now. Please try again later.'));
    } finally {
      setLoading(false);
    }
  };

  const followPerson = async (person) => {
    if (following.has(person.id) || followingInProgress.has(person.id)) return;
    setFollowingInProgress(previous => new Set([...previous, person.id]));
    try {
      const response = await api.post(`/stores/${person.id}/follow`);
      if (response.data?.following === true) {
        setFollowing(previous => new Set([...previous, person.id]));
      } else {
        setNotice(sw ? 'Huwezi kumfuata mtu huyu kwa sasa.' : 'You could not follow this account. Please try again.');
      }
    } catch {
      setNotice(sw ? 'Imeshindikana kumfuata mtu huyu. Jaribu tena.' : 'Could not follow this person. Please try again.');
    } finally {
      setFollowingInProgress(previous => {
        const next = new Set(previous);
        next.delete(person.id);
        return next;
      });
    }
  };

  return (
    <section style={{
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: compact ? 14 : 20,
      padding: compact ? 14 : 20,
      marginBottom: 16,
      boxShadow: compact ? 'none' : '0 4px 18px rgba(15,23,42,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          background: '#EFF6FF', color: BLUE, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 5px', fontSize: compact ? 16 : 21,
            lineHeight: 1.25, fontWeight: 900, color: DARK }}>
            {sw ? 'Tafuta watu unaowafahamu' : 'Find people you know'}
          </h2>
          <p style={{ margin: 0, color: MUTED, fontSize: 13, lineHeight: 1.55 }}>
            {sw
              ? 'Chagua contacts zako ili kugundua marafiki ambao tayari wanatumia Kentexa na uanze kuwafuata.'
              : 'Select your contacts to discover friends who are already on Kentexa and follow them.'}
          </p>
        </div>
      </div>

      <button type="button" onClick={findContacts} disabled={loading}
        style={{ width: '100%', marginTop: 15, padding: '13px 16px',
          border: 'none', borderRadius: 12, background: loading ? '#E2E8F0' : BLUE,
          color: loading ? MUTED : '#FFFFFF', fontSize: 14,
          fontWeight: 800, cursor: loading ? 'default' : 'pointer' }}>
        {loading
          ? (sw ? 'Inaangalia contacts...' : 'Checking contacts...')
          : searched
            ? (sw ? 'Jaribu tena' : 'Try again')
            : (sw ? 'Tafuta kwenye contacts' : 'Find contacts')}
      </button>

      <p style={{ margin: '9px 0 0', color: MUTED, fontSize: 11, lineHeight: 1.5 }}>
        {sw
          ? 'Ni contacts utakazochagua tu zitakazotumika. Hatuhifadhi address book yako. Unaweza kuruka hatua hii.'
          : 'Only contacts you select are checked. We do not store your address book. You can skip this step.'}
      </p>

      {notice && <p role="status" style={{ margin: '12px 0 0', color: DARK,
        fontSize: 12, lineHeight: 1.5 }}>{notice}</p>}

      {matches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
          {matches.map(person => {
            const isFollowing = following.has(person.id);
            const displayName = person.storeName || person.name || (sw ? 'Mtumiaji wa Kentexa' : 'Kentexa user');
            return (
              <div key={person.id} style={{ display: 'flex', alignItems: 'center',
                gap: 10, padding: '10px 0', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden',
                  flexShrink: 0, background: '#EFF6FF', color: BLUE, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                  {person.logo
                    ? <img src={person.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: MUTED }}>
                    {[person.city, person.role].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button type="button" onClick={() => followPerson(person)} disabled={isFollowing || followingInProgress.has(person.id)}
                  style={{ border: 'none', borderRadius: 9, padding: '8px 12px',
                    background: isFollowing || followingInProgress.has(person.id) ? '#F1F5F9' : BLUE,
                    color: isFollowing || followingInProgress.has(person.id) ? MUTED : '#FFFFFF', fontSize: 11,
                    fontWeight: 800, cursor: isFollowing || followingInProgress.has(person.id) ? 'default' : 'pointer' }}>
                  {isFollowing ? (sw ? 'Unafuata' : 'Following') : followingInProgress.has(person.id) ? (sw ? 'Inapakia...' : 'Following...') : (sw ? 'Fuata' : 'Follow')}
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
