export interface MultipartFile {
  fieldName: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface MultipartPayload {
  fields: Readonly<Record<string, string>>;
  files: ReadonlyArray<MultipartFile>;
}

function splitBuffer(source: Buffer, separator: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let offset = 0;
  let index = source.indexOf(separator, offset);
  while (index !== -1) {
    parts.push(source.subarray(offset, index));
    offset = index + separator.length;
    index = source.indexOf(separator, offset);
  }
  parts.push(source.subarray(offset));
  return parts;
}

function dispositionValue(header: string, key: string): string | null {
  const match = header.match(new RegExp(`${key}="([^"]*)"`, 'i'));
  return match?.[1] ?? null;
}

export function parseMultipart(contentType: string | undefined, body: Buffer): MultipartPayload {
  const boundaryMatch = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]?.trim();
  if (!boundary || boundary.length > 200) throw new Error('Missing multipart boundary.');

  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  const files: MultipartFile[] = [];
  const separator = Buffer.from(`--${boundary}`);

  for (const rawPart of splitBuffer(body, separator)) {
    let part = rawPart;
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(-2).toString() === '\r\n') part = part.subarray(0, -2);
    if (part.length === 0 || part.toString() === '--') continue;
    if (part.subarray(-2).toString() === '--') part = part.subarray(0, -2);

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) continue;
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    const data = part.subarray(headerEnd + 4);
    const disposition = headerText.split('\r\n').find((line) => line.toLowerCase().startsWith('content-disposition:'));
    if (!disposition) continue;
    const fieldName = dispositionValue(disposition, 'name');
    if (!fieldName) continue;
    const fileName = dispositionValue(disposition, 'filename');
    const mimeLine = headerText.split('\r\n').find((line) => line.toLowerCase().startsWith('content-type:'));
    const mimeType = mimeLine?.split(':').slice(1).join(':').trim().toLowerCase() || 'application/octet-stream';

    if (fileName) files.push({ fieldName, fileName, mimeType, data });
    else fields[fieldName] = data.toString('utf8').trim();
  }

  return { fields, files };
}
