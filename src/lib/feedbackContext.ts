import type { Message } from '@/types';

/** The answer being rated and the student's question that produced it (the nearest user message before it). */
export function feedbackContext(messages: Message[], messageId: string): { question: string; answer: string } {
  const at = messages.findIndex((m) => m.id === messageId);
  if (at < 0) return { question: '', answer: '' };
  let question = '';
  for (let i = at - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      question = messages[i].content;
      break;
    }
  }
  return { question, answer: messages[at].content };
}
