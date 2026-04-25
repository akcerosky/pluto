import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deserializeThreadMetadata, threadCollectionRef } from '../lib/chatStore';
import type { ThreadMetadata } from '../types';

export const useThreads = (uid?: string | null) => {
  const queryKey = uid && db ? uid : '';
  const [state, setState] = useState<{
    key: string;
    threads: ThreadMetadata[];
    isLoading: boolean;
  }>({
    key: '',
    threads: [],
    isLoading: true,
  });

  useEffect(() => {
    if (!queryKey || !db) {
      return undefined;
    }

    const ref = query(threadCollectionRef(db, queryKey), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setState({
          key: queryKey,
          threads: snapshot.docs
            .map((docSnapshot) => deserializeThreadMetadata(docSnapshot.id, docSnapshot.data()))
            .filter((thread): thread is ThreadMetadata => Boolean(thread)),
          isLoading: false,
        });
      },
      (error) => {
        console.warn('Thread subscription failed.', error);
        setState({
          key: queryKey,
          threads: [],
          isLoading: false,
        });
      }
    );

    return unsubscribe;
  }, [queryKey]);

  return useMemo(
    () =>
      queryKey
        ? {
            threads: state.key === queryKey ? state.threads : [],
            isLoading: state.key === queryKey ? state.isLoading : true,
          }
        : { threads: [] as ThreadMetadata[], isLoading: false },
    [queryKey, state]
  );
};
