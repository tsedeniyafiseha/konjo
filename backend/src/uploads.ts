import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { MultipartFile } from './multipart.ts';

export interface StoredApplicationFile {
  fieldName: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
}

export interface PreparedApplicationFile {
  metadata: StoredApplicationFile;
  data: Buffer;
}

const permittedTypes = new Map<string, ReadonlyArray<string>>([
  ['application/pdf', ['.pdf']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/msword', ['.doc']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
]);

function hasExpectedSignature(file: MultipartFile): boolean {
  if (file.mimeType === 'application/pdf') return file.data.subarray(0, 4).toString() === '%PDF';
  if (file.mimeType === 'image/jpeg') return file.data[0] === 0xff && file.data[1] === 0xd8 && file.data[2] === 0xff;
  if (file.mimeType === 'image/png') return file.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return file.data[0] === 0x50 && file.data[1] === 0x4b;
  if (file.mimeType === 'application/msword') return file.data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return false;
}

function safeExtension(file: MultipartFile): string {
  const extension = extname(file.fileName).toLowerCase();
  const allowedExtensions = permittedTypes.get(file.mimeType);
  if (!allowedExtensions?.includes(extension) || !hasExpectedSignature(file)) {
    throw new Error(`Unsupported file: ${file.fileName}`);
  }
  return extension;
}

export function prepareApplicationFiles(
  files: ReadonlyArray<MultipartFile>,
): ReadonlyArray<PreparedApplicationFile> {
  return files.map((file, index) => {
    const extension = safeExtension(file);
    const storedName = `${file.fieldName}-${index + 1}${extension}`;
    return {
      data: file.data,
      metadata: {
        fieldName: file.fieldName,
        originalName: file.fileName.slice(0, 180),
        storedName,
        mimeType: file.mimeType,
        size: file.data.length,
      },
    };
  });
}

export async function storeApplicationFiles(
  baseDirectory: string,
  applicationId: string,
  files: ReadonlyArray<MultipartFile>,
): Promise<ReadonlyArray<StoredApplicationFile>> {
  const directory = join(baseDirectory, applicationId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const prepared = prepareApplicationFiles(files);
  for (const file of prepared) {
    await writeFile(join(directory, file.metadata.storedName), file.data, { mode: 0o600 });
  }
  return prepared.map((file) => file.metadata);
}
