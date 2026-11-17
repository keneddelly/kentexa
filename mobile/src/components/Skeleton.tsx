import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Grey shapes of the cards while the feed loads (#422 N1), gently pulsing; never a spinner. */
function Pulse({ style }: { style: any }) {
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ backgroundColor: colors.line, opacity: a }, style]} />;
}

export function CardSkeleton() {
  return (
    <View style={s.card}>
      <Pulse style={s.avatar} />
      <View style={{ flex: 1, gap: 8 }}>
        <Pulse style={{ height: 13, width: '45%', borderRadius: 7 }} />
        <Pulse style={{ height: 13, width: '95%', borderRadius: 7 }} />
        <Pulse style={{ height: 13, width: '80%', borderRadius: 7 }} />
        <Pulse style={{ height: 170, width: '100%', borderRadius: 16, marginTop: 4 }} />
      </View>
    </View>
  );
}

export function FeedSkeleton() {
  return <View>{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</View>;
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 44, height: 44, borderRadius: 22 },
});
