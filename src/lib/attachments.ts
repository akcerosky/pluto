export interface InlineAttachmentInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
}

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read attachment.'));
        return;
      }

      const [, base64Data = ''] = result.split(',', 2);
      if (!base64Data) {
        reject(new Error('Attachment data is empty.'));
        return;
      }

      resolve(base64Data);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read attachment.'));
    reader.readAsDataURL(file);
  });

export const estimateInlineRequestBytes = ({
  prompt,
  attachments,
}: {
  prompt: string;
  attachments: InlineAttachmentInput[];
}) =>
  new TextEncoder().encode(
    JSON.stringify({
      prompt,
      attachments,
    })
  ).length;
