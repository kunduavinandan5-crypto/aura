export type Role = 'user' | 'assistant' | 'system';

export interface RagSourceChunk {
  documentId: string;
  documentTitle: string;
  snippet: string;
  similarityScore: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  imageUrl?: string;
  sources?: RagSourceChunk[];
  suggestedFollowups?: string[];
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
