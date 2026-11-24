import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type InboxMode, type Msg, isMine, listMessages, sendMessage } from '../api/inbox';
import { ApiError } from '../api/client';
import { colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams, 'Thread'>;

// The app has no live socket yet, so an open chat refreshes itself every few seconds.
const REFRESH_MS = 8000;

/** One conversation: messages, a composer, and a quiet refresh while the screen is open. */
export default function ThreadScreen({ route, navigation }: P) {
  const { mode, id } = route.params;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<Msg>>(null);
  // The composer sits above the phone's bottom bar (Android buttons, iPhone home line),
  // so the Send button is never hidden under it.
  const insets = useSafeAreaInsets();

  const load = useCallback(async (quiet = false) => {
    try {
      const r = await listMessages(mode as InboxMode, id);
      // Keep any message still being sent, so a refresh never drops it.
      setMessages((prev) => {
        const pending = prev.filter((m) => m._status === 'sending' || m._status === 'failed');
        return [...r.messages, ...pending];
      });
      if (r.title) navigation.setOptions({ title: r.title });
      setError('');
    } catch (e) {
      if (!quiet) setError(e instanceof ApiError ? e.message : 'Mazungumzo hayakupakiwa.');
    } finally {
      setLoading(false);
    }
  }, [mode, id, navigation]);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]));

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    const tempId = -Date.now();
    setText('');
    setMessages((prev) => [...prev, { id: tempId, content, senderType: mode === 'buyer' ? 'customer' : 'seller', _status: 'sending' }]);
    setSending(true);
    try {
      const saved = await sendMessage(mode as InboxMode, id, content);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _status: 'failed' } : m)));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.muted} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={[type.meta, s.empty]}>{error || 'Anza mazungumzo kwa ujumbe wa kwanza.'}</Text>}
          renderItem={({ item }) => {
            const mine = isMine(item, mode as InboxMode);
            return (
              <View style={[s.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                <View style={[s.bubble, mine ? s.mine : s.theirs, item.isNote && s.note]}>
                  {item.content ? <Text style={[type.body, mine && s.mineText]}>{item.content}</Text> : null}
                  {item._status === 'failed' && <Text style={s.failed}>Haikutumwa. Gusa kujaribu tena.</Text>}
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Andika ujumbe"
          placeholderTextColor={colors.faint}
          multiline
          accessibilityLabel="Ujumbe"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Tuma" onPress={send} disabled={!text.trim() || sending}
          style={({ pressed }) => [s.send, (!text.trim() || sending) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
          <Text style={s.sendText}>Tuma</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 12, paddingVertical: 12, gap: 6, flexGrow: 1 },
  empty: { textAlign: 'center', padding: 24 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  mine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  mineText: { color: '#fff' },
  theirs: { backgroundColor: colors.soft, borderBottomLeftRadius: 4 },
  note: { backgroundColor: '#fef3c7' },
  failed: { fontSize: 12, color: colors.danger, marginTop: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: '#fff' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter-Regular', color: colors.ink },
  send: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 15 },
});
