import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { logger } from 'firebase-functions';

const emulatorPortOffset = process.pid % 1000;
const projectId = 'demo-pluto-learning-test';
const repoRoot = path.resolve(__dirname, '../../..');
const emulatorConfigPath = path.join(repoRoot, '.tmp-learning-emulator.firebase.json');
const configstoreDir = path.join(repoRoot, '.tmp-firebase-configstore');
const firebaseToolsHome = path.join(configstoreDir, 'home');
const javaHome = 'C:\\Users\\prave\\AppData\\Local\\Programs\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot';
const javaBinPath = `${javaHome}\\bin`;
const firestorePort = 18080 + emulatorPortOffset;
const emulatorHubPort = 18440 + emulatorPortOffset;
const emulatorLoggingPort = 18500 + emulatorPortOffset;

process.env.GOOGLE_CLOUD_PROJECT = 'demo-pluto-learning-test';
process.env.GCLOUD_PROJECT = 'demo-pluto-learning-test';
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${firestorePort}`;

jest.mock('firebase-functions', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../lib/http.js', () => ({
  assertAuth: jest.fn(() => 'user-1'),
  getBootstrapIdentity: jest.fn(() => undefined),
}));

const getMeSnapshot = jest.fn(async () => ({
  subscription: { plan: 'Plus' },
  planDefinition: { learningFeaturesEnabled: true },
}));
const reserveUsageTokens = jest.fn(async () => undefined);
const releaseReservedUsageTokens = jest.fn(async () => undefined);
const reconcileUsageTokens = jest.fn(async () => ({
  usageTodayTokens: 100,
  dailyTokenLimit: 250000,
  remainingTodayTokens: 249900,
  estimatedMessagesLeft: 62,
  premiumModeCount: 0,
  freePremiumModesRemainingToday: 0,
}));

jest.mock('../services/firestoreRepo.js', () => ({
  getMeSnapshot,
  reserveUsageTokens,
  releaseReservedUsageTokens,
  reconcileUsageTokens,
}));

jest.mock('../services/ai/orchestrator.js', () => ({
  executeHybridAiRequest: jest.fn(),
}));

jest.mock('../services/learning/searchAdapter.js', () => ({
  searchExamFormatSources: jest.fn(),
}));

jest.mock('../lib/firebaseAdmin.js', () => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'demo-pluto-learning-test';
  const app =
    getApps().find((candidate) => candidate.name === 'learning-integration-tests') ||
    initializeApp({ projectId }, 'learning-integration-tests');

  return {
    adminDb: getFirestore(app),
  };
});

import { executeHybridAiRequest } from '../services/ai/orchestrator.js';
import { searchExamFormatSources } from '../services/learning/searchAdapter.js';
import {
  generateFlashcardSetHandler,
  generatePaperFromPdfsHandler,
  generateQuestionPaperHandler,
  submitCardReviewHandler,
} from './learning.js';

const executeHybridAiRequestMock = executeHybridAiRequest as jest.Mock;
const searchExamFormatSourcesMock = searchExamFormatSources as jest.Mock;
const adminApp =
  getApps().find((candidate) => candidate.name === 'learning-integration-tests') ||
  initializeApp({ projectId }, 'learning-integration-tests');
const adminDb = getFirestore(adminApp);

let emulatorProcess: ChildProcessWithoutNullStreams | null = null;

jest.setTimeout(180_000);

const waitForEmulatorReady = async (child: ChildProcessWithoutNullStreams, targetPort: number) => {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const onExit = (code: number | null) => {
      if (!settled) {
        cleanup();
        reject(new Error(`Firestore emulator exited before becoming ready (code: ${code ?? 'unknown'}).`));
      }
    };
    const cleanup = () => {
      child.off('exit', onExit);
      clearInterval(interval);
    };
    const interval = setInterval(() => {
      const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
      socket.once('connect', () => {
        socket.destroy();
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      });
      socket.once('error', () => {
        socket.destroy();
      });
    }, 250);
    child.on('exit', onExit);
  });
};

const waitForChildExit = async (child: ChildProcessWithoutNullStreams, timeoutMs: number) =>
  await new Promise<void>((resolve) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };
    const onExit = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    }, timeoutMs);

    child.once('exit', onExit);
  });

const clearFirestore = async () => {
  await fetch(
    `http://127.0.0.1:${firestorePort}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
};

beforeAll(async () => {
  await fs.mkdir(path.join(configstoreDir, 'configstore'), { recursive: true });
  await fs.mkdir(firebaseToolsHome, { recursive: true });
  await fs.writeFile(
    path.join(configstoreDir, 'configstore', 'firebase-tools.json'),
    JSON.stringify({}),
    'utf8'
  );

  await fs.writeFile(
    emulatorConfigPath,
    JSON.stringify(
      {
        emulators: {
          firestore: {
            host: '127.0.0.1',
            port: firestorePort,
          },
          hub: {
            host: '127.0.0.1',
            port: emulatorHubPort,
          },
          logging: {
            host: '127.0.0.1',
            port: emulatorLoggingPort,
          },
          ui: {
            enabled: false,
          },
        },
      },
      null,
      2
    )
  );

  emulatorProcess = spawn(
    'cmd.exe',
    [
      '/c',
      'firebase.cmd',
      'emulators:start',
      '--only',
      'firestore',
      '--project',
      projectId,
      '--config',
      emulatorConfigPath,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        Path: `${javaBinPath};${process.env.Path ?? process.env.PATH ?? ''}`,
        PATH: `${javaBinPath};${process.env.PATH ?? process.env.Path ?? ''}`,
        FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
        GOOGLE_CLOUD_PROJECT: projectId,
        GCLOUD_PROJECT: projectId,
        XDG_CONFIG_HOME: configstoreDir,
        HOME: firebaseToolsHome,
        USERPROFILE: firebaseToolsHome,
        APPDATA: path.join(firebaseToolsHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(firebaseToolsHome, 'AppData', 'Local'),
        TMPDIR: os.tmpdir(),
        TMP: os.tmpdir(),
        TEMP: os.tmpdir(),
      },
      stdio: 'ignore',
    }
  );

  await waitForEmulatorReady(emulatorProcess, firestorePort);
});

afterAll(async () => {
  if (emulatorProcess?.exitCode === null) {
    emulatorProcess.kill('SIGINT');
    await waitForChildExit(emulatorProcess, 5_000);
    if (emulatorProcess.exitCode === null) {
      const killer = spawn('cmd.exe', ['/c', 'taskkill', '/PID', String(emulatorProcess.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
      await once(killer, 'exit').catch(() => undefined);
      await waitForChildExit(emulatorProcess, 10_000);
    }
  }
  await fs.unlink(emulatorConfigPath).catch(() => undefined);
  await fs.rm(configstoreDir, { recursive: true, force: true }).catch(() => undefined);
  await deleteApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  jest.clearAllMocks();
  await clearFirestore();
});

test.skip('generateQuestionPaperHandler creates a ready question paper document', async () => {
  searchExamFormatSourcesMock.mockResolvedValue([
    { title: 'CBSE format', url: 'https://example.com/format', snippet: '80 marks, 3 hours' },
  ]);
  executeHybridAiRequestMock
    .mockResolvedValueOnce({
      text: JSON.stringify({
        totalMarks: 80,
        duration: '3 hours',
        sections: [
          {
            name: 'Section A',
            instructions: 'Answer all questions.',
            questionType: 'Short Answer',
            questions: 5,
            marksPerQuestion: 2,
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, usageSource: 'provider' },
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'CBSE Class 10 Physics',
        format: {
          totalMarks: 80,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 5,
              marksPerQuestion: 2,
            },
          ],
        },
        questions: [
          {
            id: 'q-1',
            sectionName: 'Section A',
            questionNumber: 1,
            text: 'Define inertia.',
            type: 'short_answer',
            marks: 2,
          },
        ],
      }),
      usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50, usageSource: 'provider' },
    });

  const result = await generateQuestionPaperHandler({
    auth: { uid: 'user-1' },
    data: {
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      topic: 'Light',
      requestId: 'req-paper-1',
    },
  } as never);

  const paperSnap = await adminDb
    .collection('users')
    .doc('user-1')
    .collection('questionPapers')
    .doc(result.paperId)
    .get();

  expect(paperSnap.exists).toBe(true);
  expect(paperSnap.data()).toMatchObject({
    status: 'ready',
    sourceType: 'topic',
    subject: 'Physics',
  });
  expect(logger.info).toHaveBeenCalledWith(
    'paper_generation_started',
    expect.objectContaining({
      eventType: 'paper_generation_started',
      requestId: 'req-paper-1',
      subject: 'Physics',
      examBoard: 'CBSE',
      educationLevel: 'Class 10',
    })
  );
  expect(logger.info).toHaveBeenCalledWith(
    'paper_generation_completed',
    expect.objectContaining({
      eventType: 'paper_generation_completed',
      requestId: 'req-paper-1',
      questionCount: 1,
      sectionCount: 1,
    })
  );
});

test.skip('generateFlashcardSetHandler creates a set doc and at least 5 cards', async () => {
  executeHybridAiRequestMock.mockResolvedValueOnce({
    text: JSON.stringify({
      title: 'Photosynthesis Basics',
      subject: 'Biology',
      cards: Array.from({ length: 5 }, (_, index) => ({
        front: `Front ${index + 1}`,
        back: `Back ${index + 1}`,
        concept: `Concept ${index + 1}`,
        order: index + 1,
      })),
    }),
    usage: { inputTokens: 11, outputTokens: 12, totalTokens: 23, usageSource: 'provider' },
  });

  const result = await generateFlashcardSetHandler({
    auth: { uid: 'user-1' },
    data: {
      topic: 'Photosynthesis',
      subject: 'Biology',
      educationLevel: 'Class 10',
      requestId: 'req-flashcards-1',
    },
  } as never);

  const setRef = adminDb.collection('users').doc('user-1').collection('flashcardSets').doc(result.setId);
  const setSnap = await setRef.get();
  const cardsSnap = await setRef.collection('cards').get();

  expect(setSnap.exists).toBe(true);
  expect(cardsSnap.size).toBeGreaterThanOrEqual(5);
  expect(logger.info).toHaveBeenCalledWith(
    'flashcard_set_generation_started',
    expect.objectContaining({
      eventType: 'flashcard_set_generation_started',
      requestId: 'req-flashcards-1',
      topic: 'Photosynthesis',
      subject: 'Biology',
      educationLevel: 'Class 10',
    })
  );
  expect(logger.info).toHaveBeenCalledWith(
    'flashcard_set_generation_completed',
    expect.objectContaining({
      eventType: 'flashcard_set_generation_completed',
      requestId: 'req-flashcards-1',
      cardCount: 5,
    })
  );
});

test.skip('generatePaperFromPdfsHandler creates a ready pdf-sourced paper document', async () => {
  searchExamFormatSourcesMock.mockResolvedValue([
    { title: 'CBSE format', url: 'https://example.com/format', snippet: '80 marks, 3 hours' },
  ]);
  executeHybridAiRequestMock
    .mockResolvedValueOnce({
      text: 'Lesson text extracted from PDF.',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, usageSource: 'provider' },
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        subject: 'Chemistry',
        primaryTopic: 'Chemical Reactions',
        coveredConcepts: ['Combination reaction', 'Decomposition reaction'],
        keyFacts: ['Reaction releases energy', 'Balance equations carefully'],
        questionBoundaries: ['Avoid electrochemistry'],
      }),
      usage: { inputTokens: 60, outputTokens: 40, totalTokens: 100, usageSource: 'provider' },
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        totalMarks: 80,
        duration: '3 hours',
        sections: [
          {
            name: 'Section A',
            instructions: 'Answer all questions.',
            questionType: 'Short Answer',
            questions: 5,
            marksPerQuestion: 2,
          },
        ],
      }),
      usage: { inputTokens: 12, outputTokens: 12, totalTokens: 24, usageSource: 'provider' },
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Chemistry Question Paper',
        format: {
          totalMarks: 80,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 5,
              marksPerQuestion: 2,
            },
          ],
        },
        questions: [
          {
            id: 'q-1',
            sectionName: 'Section A',
            questionNumber: 1,
            text: 'What is a combination reaction?',
            type: 'short_answer',
            marks: 2,
          },
        ],
      }),
      usage: { inputTokens: 25, outputTokens: 30, totalTokens: 55, usageSource: 'provider' },
    });

  const pdfBase64 = Buffer.from('fake pdf bytes').toString('base64');
  const result = await generatePaperFromPdfsHandler({
    auth: { uid: 'user-1' },
    data: {
      pdfAttachments: [
        {
          name: 'lesson.pdf',
          mimeType: 'application/pdf',
          sizeBytes: Buffer.from('fake pdf bytes').byteLength,
          base64Data: pdfBase64,
        },
      ],
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      subject: 'Chemistry',
      requestId: 'req-pdf-paper-1',
    },
  } as never);

  const paperSnap = await adminDb
    .collection('users')
    .doc('user-1')
    .collection('questionPapers')
    .doc(result.paperId)
    .get();

  expect(paperSnap.exists).toBe(true);
  expect(paperSnap.data()).toMatchObject({
    status: 'ready',
    sourceType: 'pdf',
    subject: 'Chemistry',
  });
  expect(logger.info).toHaveBeenCalledWith(
    'paper_generation_started',
    expect.objectContaining({
      eventType: 'paper_generation_started',
      requestId: 'req-pdf-paper-1',
      sourceType: 'pdf',
      subject: 'Chemistry',
    })
  );
});

test.skip('submitCardReviewHandler updates SM-2 fields for an easy review', async () => {
  const setRef = adminDb.collection('users').doc('user-1').collection('flashcardSets').doc('set-1');
  const nowIso = new Date().toISOString();
  await setRef.set({
    id: 'set-1',
    title: 'Physics',
    subject: 'Physics',
    topic: 'Light',
    educationLevel: 'Class 10',
    totalCards: 1,
    createdAt: nowIso,
    stats: {
      mastered: 0,
      reviewing: 0,
      learning: 1,
      new: 0,
      dueToday: 1,
    },
  });
  await setRef.collection('cards').doc('card-1').set({
    id: 'card-1',
    front: 'What is refraction?',
    back: 'Bending of light.',
    concept: 'Refraction',
    order: 1,
    interval: 3,
    easinessFactor: 2.5,
    repetitions: 2,
    nextReviewAt: nowIso,
    masteryLevel: 'learning',
    timesReviewed: 2,
    timesCorrect: 2,
  });

  await submitCardReviewHandler({
    auth: { uid: 'user-1' },
    data: {
      setId: 'set-1',
      cardId: 'card-1',
      rating: 'easy',
      sessionId: 'session-1',
      requestId: 'req-review-1',
    },
  } as never);

  const updatedCardSnap = await setRef.collection('cards').doc('card-1').get();
  const updatedCard = updatedCardSnap.data();

  expect(updatedCard).toMatchObject({
    interval: 8,
    repetitions: 3,
    masteryLevel: 'reviewing',
    lastRating: 'easy',
  });
  expect(new Date(updatedCard?.nextReviewAt as string).getTime()).toBeGreaterThan(
    new Date(nowIso).getTime()
  );
  expect(logger.info).toHaveBeenCalledWith(
    'review_session_completed',
    expect.objectContaining({
      eventType: 'review_session_completed',
      requestId: 'req-review-1',
      setId: 'set-1',
      sessionId: 'session-1',
      cardsReviewed: 1,
      easyCount: 1,
      goodCount: 0,
      hardCount: 0,
    })
  );
});
