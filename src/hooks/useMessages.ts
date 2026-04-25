import { useCallback, useEffect, useMemo, useState } from 'react';
import { limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deserializeMessage, threadMessagesCollectionRef } from '../lib/chatStore';
import type { Message } from '../types';

const MESSAGE_PAGE_SIZE = 50;

export const useMessages = (uid?: string | null, threadId?: string | null) => {
  const queryKey = uid && threadId && db ? `${uid}:${threadId}` : '';
  const [pageState, setPageState] = useState<{ key: string; pageSize: number }>({
    key: '',
    pageSize: MESSAGE_PAGE_SIZE,
  });
  const [state, setState] = useState<{
    key: string;
    messages: Message[];
    isLoading: boolean;
    hasMore: boolean;
  }>({
    key: '',
    messages: [],
    isLoading: true,
    hasMore: false,
  });

  const effectivePageSize =
    pageState.key === queryKey ? pageState.pageSize : MESSAGE_PAGE_SIZE;

  useEffect(() => {
    if (!queryKey || !uid || !threadId || !db) {
      return undefined;
    }

    const ref = query(
      threadMessagesCollectionRef(db, uid, threadId),
      orderBy('timestamp', 'desc'),
      limit(effectivePageSize)
    );

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setState({
          key: queryKey,
          messages: snapshot.docs
            .map((docSnapshot) => deserializeMessage(docSnapshot.id, docSnapshot.data()))
            .sort((left, right) => left.timestamp - right.timestamp),
          isLoading: false,
          hasMore: snapshot.docs.length >= effectivePageSize,
        });
      },
      (error) => {
        console.warn('Message subscription failed.', error);
        setState({
          key: queryKey,
          messages: [],
          isLoading: false,
          hasMore: false,
        });
      }
    );

    return unsubscribe;
  }, [effectivePageSize, queryKey, threadId, uid]);

  const loadOlderMessages = useCallback(() => {
    if (!queryKey) {
      return;
    }

    setPageState((current) =>
      current.key === queryKey
        ? { key: queryKey, pageSize: current.pageSize + MESSAGE_PAGE_SIZE }
        : { key: queryKey, pageSize: MESSAGE_PAGE_SIZE * 2 }
    );
  }, [queryKey]);

  return useMemo(
    () =>
      queryKey
        ? {
            messages: state.key === queryKey ? state.messages : [],
            isLoading: state.key === queryKey ? state.isLoading : true,
            hasMore: state.key === queryKey ? state.hasMore : false,
            loadOlderMessages,
            pageSize: effectivePageSize,
          }
        : {
            messages: [] as Message[],
            isLoading: false,
            hasMore: false,
            loadOlderMessages,
            pageSize: MESSAGE_PAGE_SIZE,
          },
    [effectivePageSize, loadOlderMessages, queryKey, state]
  );
};
