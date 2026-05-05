import type { AiInlineAttachment } from '../../types/index.js';
import type { AiProvider } from './providerTypes.js';

export const selectPrimaryProvider = (attachments: AiInlineAttachment[]): AiProvider =>
  attachments.length > 0 ? 'nova-lite' : 'nova-micro';
