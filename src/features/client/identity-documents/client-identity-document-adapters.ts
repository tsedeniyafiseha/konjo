import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type {
  ClientIdentityDocumentKind,
  ClientIdentityDocumentPicker,
  ClientIdentityDocumentRuntime,
} from '@/application/client-identity-documents/client-identity-document-contracts';

function mimeType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function safeName(name: string): string {
  const segments = name.toLowerCase().split('.');
  const extension = segments.length > 1 ? segments.pop()?.replace(/[^a-z0-9]/g, '').slice(0, 5) : undefined;
  const stem = segments.join('-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'identity';
  return extension ? `${stem}.${extension}` : `${stem}.jpg`;
}

export const expoClientIdentityDocumentPicker: ClientIdentityDocumentPicker = {
  async pick(kind) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Photo access is required to choose your identity document.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'passport' ? [7, 5] : [3, 2],
      quality: 0.85,
      base64: false,
      exif: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    const name = safeName(asset.fileName || `${kind}-${Date.now()}.jpg`);
    const bytes = asset.file ? await asset.file.arrayBuffer() : await new ExpoFile(asset.uri).arrayBuffer();
    return { name, mimeType: asset.mimeType?.toLowerCase() ?? mimeType(name), size: bytes.byteLength, bytes };
  },
};

export const systemClientIdentityDocumentRuntime: ClientIdentityDocumentRuntime = {
  createStoragePath(clientId: string, kind: ClientIdentityDocumentKind, originalName: string): string {
    const nonce = Math.random().toString(36).slice(2, 10);
    return `${clientId}/${kind}/${Date.now()}-${nonce}-${safeName(originalName)}`;
  },
};
