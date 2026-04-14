import type { EducationLevel, ChatMode } from '../context/appContextTypes';
import type { SubscriptionPlan } from '../config/subscription';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: ChatMode;
  timestamp: number;
}

export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  mode: ChatMode;
  educationLevel: EducationLevel;
  objective: string;
  createdAt: number;
  updatedAt: number;
  projectId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  educationLevel: EducationLevel;
  objective: string;
  avatar?: string;
  plan?: SubscriptionPlan;
}
