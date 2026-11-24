import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Button } from '../components/Ui';
import { WEB_URL } from '../config';
import { F, colors, type } from '../theme';
import type { RootStackParams } from '../navigation/types';

type P = NativeStackScreenProps<RootStackParams, 'CreateClassified'>;

interface Category { key: string; label: string }

const MIN_PHOTOS = 1;
const MAX_PHOTOS = 4;

/**
 * Weka tangazo, native: the classified ad form. Posts to the same POST /classifieds the web
 * form uses. The server still does the full check (category rules, verification, identity);
 * its message is shown as it comes.
 */
export default function CreateClassifiedScreen({ navigation }: P) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Category[]>('/categories')
      .then((rows) => setCategories(Array.isArray(rows) ? rows : []))
      .catch(() => setError('Makundi hayakupakia. Jaribu tena.'));
  }, []);

  const pickPhotos = async () => {
    setError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Ruhusu app kufikia picha zako ili kuweka picha.');
      return;
    }
    const left = MAX_PHOTOS - images.length;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: left,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;

    setUploading(true);
    try {
      const form = new FormData();
      picked.assets.slice(0, left).forEach((a, i) => {
        form.append('files', {
          uri: a.uri,
          name: a.fileName || `picha-${Date.now()}-${i}.jpg`,
          type: a.mimeType || 'image/jpeg',
        } as any);
      });
      const res: any = await api.post('/upload/images', form);
      const urls: string[] = Array.isArray(res?.urls) ? res.urls : [];
      if (!urls.length) throw new Error('no-urls');
      setImages((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS));
    } catch {
      setError('Picha hazikupakiwa. Jaribu tena.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (url: string) => setImages((prev) => prev.filter((u) => u !== url));

  const submit = async () => {
    setError('');
    if (title.trim().length < 3) return setError('Andika jina la tangazo (angalau herufi 3).');
    if (!description.trim()) return setError('Andika maelezo ya bidhaa au huduma.');
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 1) return setError('Weka bei sahihi.');
    if (!category) return setError('Chagua kundi.');
    if (images.length < MIN_PHOTOS) return setError('Ongeza angalau picha moja.');

    setSaving(true);
    try {
      const created: any = await api.post('/classifieds', {
        title: title.trim(),
        description: description.trim(),
        price: amount,
        category,
        location: location.trim() || undefined,
        images,
      });
      if (created?.id) {
        navigation.replace('Web', { url: `${WEB_URL}/p/ClassifiedDetail-${created.id}`, title: title.trim() });
      } else {
        navigation.goBack();
      }
    } catch (e: any) {
      setError(e?.message || 'Tangazo halijawekwa. Jaribu tena.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={type.meta}>Jina la tangazo</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Mfano: Simu ya Samsung A15" placeholderTextColor={colors.faint} maxLength={120} />

      <Text style={type.meta}>Maelezo</Text>
      <TextInput style={[s.input, s.area]} value={description} onChangeText={setDescription} placeholder="Eleza bidhaa au huduma yako" placeholderTextColor={colors.faint} multiline />

      <Text style={type.meta}>Bei (TZS)</Text>
      <TextInput style={s.input} value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.faint} />

      <Text style={type.meta}>Kundi</Text>
      <View style={s.chips}>
        {categories.map((c) => (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityState={{ selected: category === c.key }}
            onPress={() => setCategory(c.key)}
            style={[s.chip, category === c.key && s.chipOn]}
          >
            <Text style={[s.chipText, category === c.key && s.chipTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={type.meta}>Mahali (hiari)</Text>
      <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Mfano: Mbagala, Dar es Salaam" placeholderTextColor={colors.faint} />

      <Text style={type.meta}>Picha ({images.length}/{MAX_PHOTOS})</Text>
      <View style={s.photos}>
        {images.map((url) => (
          <Pressable key={url} accessibilityRole="button" accessibilityLabel="Ondoa picha" onPress={() => removePhoto(url)}>
            <Image source={{ uri: url }} style={s.thumb} />
          </Pressable>
        ))}
        {images.length < MAX_PHOTOS && (
          <Pressable accessibilityRole="button" onPress={pickPhotos} disabled={uploading} style={s.addPhoto}>
            {uploading ? <ActivityIndicator color={colors.muted} /> : <Text style={type.meta}>+ Picha</Text>}
          </Pressable>
        )}
      </View>

      {!!error && <Text style={[type.meta, s.error]}>{error}</Text>}

      <View style={s.submit}>
        <Button title={saving ? 'Inatuma…' : 'Weka tangazo'} dark onPress={submit} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16, gap: 8 },
  input: {
    minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, fontSize: 15, fontFamily: F.regular, color: colors.ink,
  },
  area: { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontFamily: F.bold, color: colors.ink },
  chipTextOn: { color: '#fff' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.soft },
  addPhoto: {
    width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  error: { color: colors.danger, marginTop: 4 },
  submit: { marginTop: 12 },
});
