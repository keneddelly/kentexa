import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { colors, type } from '../theme';
import { OFFICE_RULES } from '../office/officeRules';

/**
 * "Mwalike ajiunge KenteXa": invite the parcel's transport (or receiving office) to join.
 * The invitation opens in the office's OWN WhatsApp or SMS app. Joining is only an application;
 * KenteXa approval is unchanged. Same endpoint and wording as the web (PartnerInvitePanel.js).
 */
const INV = OFFICE_RULES.shehena.single.invite;
type Role = keyof typeof INV.roles;
type Channel = keyof typeof INV.urlField;

export default function OfisiPartnerInvite({ parcelId, waybill, defaultPhone = '', defaultName = '' }: {
  parcelId: number; waybill: string; defaultPhone?: string; defaultName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>('transport_provider');
  const [phone, setPhone] = useState(defaultPhone);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ channel: Channel; url: string } | null>(null);

  const send = async (channel: Channel) => {
    setBusy(true);
    setError('');
    setLink(null);
    try {
      const data: any = await api.post(INV.endpoint.split(' ')[1], { parcelId, phone, name, role, channel });
      const url = data?.[INV.urlField[channel]];
      if (url) {
        setLink({ channel, url });
        Linking.openURL(url).catch(() => undefined);
      }
    } catch (e: any) {
      setError(e?.message || 'Imeshindikana kutuma mwaliko.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.box}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={[type.name, { color: '#1d4ed8' }]}>{INV.title} {open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 8 }}>
          <Text style={type.meta}>{INV.help.replace('{waybill}', waybill)}</Text>
          <View style={s.roles}>
            {(Object.keys(INV.roles) as Role[]).map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ selected: role === r }}
                style={[s.role, role === r && s.roleOn]}>
                <Text style={[type.name, role === r && { color: '#1d4ed8' }]}>{INV.roles[r]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Namba ya simu (mf. 0712345678)"
            placeholderTextColor={colors.muted} style={s.input} />
          <TextInput value={name} onChangeText={setName} placeholder="Jina (hiari)" placeholderTextColor={colors.muted} style={s.input} />
          {error ? <Text style={[type.meta, { color: '#b91c1c' }]}>{error}</Text> : null}
          <View style={s.row}>
            {(Object.keys(INV.channels) as Channel[]).map((ch) => (
              <Pressable key={ch} onPress={() => send(ch)} disabled={busy || !phone} accessibilityRole="button"
                style={[s.btn, { backgroundColor: ch === 'whatsapp' ? '#16a34a' : '#1d4ed8' }, (busy || !phone) && { opacity: 0.5 }]}>
                <Text style={s.btnText}>{INV.channels[ch]}</Text>
              </Pressable>
            ))}
          </View>
          {link ? (
            <Pressable onPress={() => Linking.openURL(link.url).catch(() => undefined)} accessibilityRole="link">
              <Text style={[type.meta, { color: '#1d4ed8', fontWeight: '700' }]}>Haikufunguka? {INV.openLink[link.channel]}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#bfdbfe', backgroundColor: '#eff6ff', padding: 12, gap: 8 },
  roles: { flexDirection: 'row', gap: 8 },
  role: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  roleOn: { borderWidth: 2, borderColor: '#1d4ed8', backgroundColor: '#eff6ff' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.ink, backgroundColor: '#fff' },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
