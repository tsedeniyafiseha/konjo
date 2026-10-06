import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type {
  PickedProfessionalDocument,
  ProfessionalDocumentKind,
  ProfessionalDocumentPicker,
  ProfessionalDocumentRuntime,
} from '@/application/professional-documents/professional-document-contracts';

const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function mimeTypeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function fileNameForMime(name: string, mimeType: string): string {
  const expectedExtensions: Record<string, readonly string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
  };
  const expected = expectedExtensions[mimeType];
  if (!expected) return name;
  const current = name.split('.').pop()?.toLowerCase();
  if (current && expected.includes(current)) return name;
  const stem = name.replace(/\.[^.]+$/, '') || 'document';
  return `${stem}.${expected[0]}`;
}

export const expoProfessionalDocumentPicker: ProfessionalDocumentPicker = {
  async pick(kind): Promise<PickedProfessionalDocument | null> {
    if (kind === 'certificate') {
      const result = await DocumentPicker.getDocumentAsync({
        type: MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (result.canceled) return null;

      const asset = result.assets[0];
      const bytes = asset.file
        ? await asset.file.arrayBuffer()
        : await new ExpoFile(asset.uri).arrayBuffer();
      const mimeType = asset.mimeType?.toLowerCase() ?? mimeTypeFromName(asset.name);
      return {
        name: fileNameForMime(asset.name, mimeType),
        mimeType,
        size: bytes.byteLength,
        bytes,
      };
    }

    const permission = kind === 'selfie'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(kind === 'selfie'
        ? 'Camera access is required to capture your verification selfie.'
        : 'Photo access is required to choose this image.');
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'selfie'
        ? [1, 1]
        : ['government_id', 'national_id_front', 'national_id_back'].includes(kind)
          ? [3, 2]
          : [4, 3],
      quality: kind === 'selfie' ? 0.8 : 0.85,
      base64: false,
      exif: false,
    };
    const result = kind === 'selfie'
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return null;

    const asset = result.assets[0];
    const fallbackName = `${kind}-${Date.now()}.jpg`;
    const originalName = asset.fileName || fallbackName;
    const mimeType = asset.mimeType?.toLowerCase() ?? mimeTypeFromName(originalName);
    const name = fileNameForMime(originalName, mimeType);
    const bytes = asset.file
      ? await asset.file.arrayBuffer()
      : await new ExpoFile(asset.uri).arrayBuffer();
    return {
      name,
      mimeType,
      size: bytes.byteLength,
      bytes,
    };
  },
};

function safeFileName(originalName: string): string {
  const segments = originalName.toLowerCase().split('.');
  const extension = segments.length > 1
    ? segments.pop()?.replace(/[^a-z0-9]/g, '').slice(0, 5)
    : undefined;
  const stem = segments.join('-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'document';
  return extension ? `${stem}.${extension}` : stem;
}

export const systemProfessionalDocumentRuntime: ProfessionalDocumentRuntime = {
  createStoragePath(
    professionalId: string,
    kind: ProfessionalDocumentKind,
    originalName: string,
  ): string {
    const nonce = Math.random().toString(36).slice(2, 10);
    return `${professionalId}/${kind}/${Date.now()}-${nonce}-${safeFileName(originalName)}`;
  },
};
