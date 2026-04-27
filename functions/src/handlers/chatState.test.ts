const mockAssertAuth = jest.fn();
const mockThreadGet = jest.fn();
const mockMessagesGet = jest.fn();
const mockRecursiveDelete = jest.fn();
const mockBulkWriterClose = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../lib/http.js', () => ({
  assertAuth: (...args: unknown[]) => mockAssertAuth(...args),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

jest.mock('../lib/firebaseAdmin.js', () => {
  const messagesCollection = {
    orderBy: jest.fn(() => ({
      limit: jest.fn(() => ({
        get: (...args: unknown[]) => mockMessagesGet(...args),
        startAfter: jest.fn((lastDoc: unknown) => ({
          get: (...args: unknown[]) => mockMessagesGet(lastDoc, ...args),
        })),
      })),
    })),
  };

  const threadDocument = {
    path: 'users/test-user/threads/thread-1',
    get: (...args: unknown[]) => mockThreadGet(...args),
    collection: jest.fn(() => messagesCollection),
  };

  return {
    adminDb: {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => threadDocument),
          })),
        })),
      })),
      recursiveDelete: (...args: unknown[]) => mockRecursiveDelete(...args),
      bulkWriter: jest.fn(() => ({
        onWriteError: jest.fn(),
        close: (...args: unknown[]) => mockBulkWriterClose(...args),
      })),
    },
  };
});

import { HttpsError } from 'firebase-functions/v2/https';
import { deleteThreadHandler } from './chatState.js';

const makeMessageSnapshot = (size: number) => ({
  empty: size === 0,
  size,
  docs:
    size === 0
      ? []
      : Array.from({ length: size }, (_, index) => ({
          ref: { path: `users/test-user/threads/thread-1/messages/msg-${index + 1}` },
          id: `msg-${index + 1}`,
        })),
});

describe('deleteThreadHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertAuth.mockReturnValue('test-user');
    mockThreadGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: false });
    mockMessagesGet
      .mockResolvedValueOnce(makeMessageSnapshot(2))
      .mockResolvedValueOnce(makeMessageSnapshot(0));
    mockRecursiveDelete.mockResolvedValue(undefined);
    mockBulkWriterClose.mockResolvedValue(undefined);
  });

  it('recursively deletes the thread, verifies cleanup, and returns success', async () => {
    const result = await deleteThreadHandler({
      auth: { uid: 'test-user', token: {} },
      data: { threadId: 'thread-1' },
    } as never);

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      threadId: 'thread-1',
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'delete_thread_completed',
      expect.objectContaining({
        threadId: 'thread-1',
        deletedMessagesEstimate: 2,
        remainingMessages: 0,
        threadExistsAfterDelete: false,
      })
    );
  });

  it('returns success when the thread is already missing', async () => {
    mockThreadGet.mockReset();
    mockThreadGet.mockResolvedValueOnce({ exists: false });
    mockMessagesGet.mockReset();
    mockMessagesGet.mockResolvedValueOnce(makeMessageSnapshot(0));

    const result = await deleteThreadHandler({
      auth: { uid: 'test-user', token: {} },
      data: { threadId: 'thread-1' },
    } as never);

    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      threadId: 'thread-1',
      deletedMessages: 0,
      threadPreviouslyMissing: true,
    });
  });

  it('throws when descendants remain after recursive delete', async () => {
    mockThreadGet.mockReset();
    mockThreadGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: true });
    mockMessagesGet.mockReset();
    mockMessagesGet
      .mockResolvedValueOnce(makeMessageSnapshot(2))
      .mockResolvedValueOnce(makeMessageSnapshot(1));

    await expect(
      deleteThreadHandler({
        auth: { uid: 'test-user', token: {} },
        data: { threadId: 'thread-1' },
      } as never)
    ).rejects.toBeInstanceOf(HttpsError);

    expect(mockLoggerError).toHaveBeenCalledWith(
      'delete_thread_incomplete',
      expect.objectContaining({
        threadId: 'thread-1',
        remainingMessages: 1,
      })
    );
  });
});
