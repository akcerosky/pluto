import { useEffect, useMemo, useState } from 'react';
import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deserializeProject, projectCollectionRef } from '../lib/chatStore';
import { runtimeLogger } from '../lib/runtimeLogger';
import type { Project } from '../types';

export const useProjects = (uid?: string | null) => {
  const queryKey = uid && db ? uid : '';
  const [state, setState] = useState<{ key: string; projects: Project[]; isLoading: boolean }>({
    key: '',
    projects: [],
    isLoading: true,
  });

  useEffect(() => {
    if (!queryKey || !db) {
      return undefined;
    }

    const ref = query(projectCollectionRef(db, queryKey), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setState({
          key: queryKey,
          projects: snapshot.docs.map((docSnapshot) => deserializeProject(docSnapshot.id, docSnapshot.data())),
          isLoading: false,
        });
      },
      (error) => {
        runtimeLogger.warn('Project subscription failed.', error, {
          hook: 'useProjects',
          uid: queryKey,
        });
        setState({
          key: queryKey,
          projects: [],
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
            projects: state.key === queryKey ? state.projects : [],
            isLoading: state.key === queryKey ? state.isLoading : true,
          }
        : { projects: [] as Project[], isLoading: false },
    [queryKey, state]
  );
};
