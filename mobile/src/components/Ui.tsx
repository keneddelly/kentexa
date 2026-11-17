import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { F, colors } from '../theme';

export function Button({ title, onPress, dark = true, disabled, busy, style }: { title: string; onPress: () => void; dark?: boolean; disabled?: boolean; busy?: boolean; style?: ViewStyle }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, dark ? s.dark : s.light, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {busy ? <ActivityIndicator color={dark ? '#fff' : colors.ink} /> : <Text style={[s.btnText, { color: dark ? '#fff' : colors.ink }]}>{title}</Text>}
    </Pressable>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {action}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { height: 44, borderRadius: 22, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  dark: { backgroundColor: colors.ink },
  light: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: 15, fontFamily: F.bold },
  empty: { padding: 32, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: F.black, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 15, fontFamily: F.regular, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
