export type Role = 'user' | 'assistant' | 'system';

export interface RagSourceChunk {
  documentId: string;
  documentTitle: string;
  snippet: string;
  similarityScore: number;
  page?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  imageUrls?: string[];
  sources?: RagSourceChunk[];
  suggestedFollowups?: string[];
  /** Backend answer id (used for /feedback) and how the answer was produced. */
  answerId?: string;
  mode?: 'llm' | 'fallback' | 'flagged' | 'no_results' | 'error';
}

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  isPinned?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  studentClass?: string; // e.g. "Class 12", "B.Tech 3rd Year"
  subject?: string; // e.g. "Computer Science", "Physics"
  avatarUrl?: string;
  isGuest: boolean;
}

export interface UserSearchRecord {
  id: string;
  userId: string;
  searchQuery: string;
  category?: string;
  createdAt: string;
}

export interface MessageFeedback {
  id?: string;
  messageId: string;
  threadId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  rating: 'positive' | 'negative' | 'thumbs_up' | 'thumbs_down';
  reason?: string | null;
  comment?: string | null;
  messageSnippet?: string | null;
  subjectId?: string | null;
  /** The student's question that produced the rated answer, and the answer itself. */
  question?: string;
  answer?: string;
  studentClass?: string | null;
  createdAt?: string;
}

