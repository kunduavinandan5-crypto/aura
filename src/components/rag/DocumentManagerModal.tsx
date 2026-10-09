import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FilePlus,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { EduDocument } from '@/types';
import { chunkDocument } from '@/lib/rag-engine';
import { toast } from 'sonner';

interface DocumentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: EduDocument[];
  onAddDocument: (doc: EduDocument) => void;
  onDeleteDocument: (id: string) => void;
}

export const DocumentManagerModal: React.FC<DocumentManagerModalProps> = ({
  isOpen,
  onClose,
  documents,
  onAddDocument,
  onDeleteDocument,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EduDocument['category']>('Lecture Notes');
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      toast.success(`Loaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
    };
    reader.readAsText(file);
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('Please enter a title and document content');
      return;
    }

    setIsProcessing(true);
    const chunks = chunkDocument(content);

    const newDoc: EduDocument = {
      id: 'doc_' + Date.now(),
      title: title.trim(),
      fileName: `${title.trim().replace(/\s+/g, '_')}.txt`,
      fileSize: new Blob([content]).size,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      category: category || 'General',
      summary: content.slice(0, 180) + '...',
      content: content.trim(),
    };

    onAddDocument(newDoc);
    setIsProcessing(false);
    setTitle('');
    setContent('');
    setActiveTab('list');
    setSelectedDocId(newDoc.id);
    toast.success(`Indexed "${newDoc.title}" (${chunks.length} chunks) to Supabase & Knowledge Base!`);
  };

  const selectedDoc = documents.find((d) => d.id === selectedDocId) || documents[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">RAG Knowledge Base</h2>
              <p className="text-xs text-zinc-400">
                Upload your course notes, textbooks, and syllabus files to feed your pre-built RAG model
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-white/10 bg-white/5 px-6">
          <button
            onClick={() => setActiveTab('list')}
            className={`border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'list'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            Knowledge Documents ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'upload'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Upload Document</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden p-6">
          {activeTab === 'list' ? (
            documents.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <BookOpen className="h-12 w-12 text-zinc-600 mb-3" />
                <h3 className="text-sm font-semibold text-white">No documents in knowledge base</h3>
                <p className="mt-1 max-w-sm text-xs text-zinc-400">
                  Upload your syllabus, research papers, lecture notes, or textbooks to ground your pre-built RAG model.
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-600/20"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload First Document</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-12 overflow-hidden">
                {/* Documents List */}
                <div className="md:col-span-5 flex flex-col space-y-2 overflow-y-auto pr-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`group relative flex cursor-pointer flex-col rounded-xl border p-3 transition-all ${
                        selectedDoc?.id === doc.id
                          ? 'border-cyan-500/40 bg-cyan-500/10 text-white'
                          : 'border-white/5 bg-white/5 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-cyan-400 shrink-0" />
                          <span className="font-semibold text-xs truncate max-w-[170px]">
                            {doc.title}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteDocument(doc.id);
                            toast.info(`Deleted ${doc.title}`);
                          }}
                          className="text-zinc-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <p className="mt-2 text-[11px] text-zinc-400 line-clamp-2">{doc.summary}</p>

                      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-cyan-300">
                          {doc.category || 'General'}
                        </span>
                        <span>{doc.chunkCount} chunks</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Document Detail Preview */}
                <div className="md:col-span-7 flex flex-col rounded-xl border border-white/10 bg-black/40 p-4 overflow-hidden">
                  {selectedDoc ? (
                    <>
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-white">{selectedDoc.title}</h4>
                          <span className="text-[11px] text-zinc-400">
                            {selectedDoc.fileName} • {(selectedDoc.fileSize / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Synced & Ready
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto mt-3 pr-2 text-xs font-mono leading-relaxed text-zinc-300 whitespace-pre-wrap">
                        {selectedDoc.content}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                      Select a document on the left to preview
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            /* Upload / Add Form */
            <form onSubmit={handleSaveDoc} className="flex h-full flex-col space-y-4 max-w-2xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300">Document Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Machine Learning Notes"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#181a24] px-3.5 py-2.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="Lecture Notes">Lecture Notes</option>
                    <option value="Textbook">Textbook Chapter</option>
                    <option value="Assignment">Assignment & Solutions</option>
                    <option value="Research Paper">Research Paper</option>
                    <option value="General">General Study Notes</option>
                  </select>
                </div>
              </div>

              {/* Upload File button */}
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>Choose File (.txt, .md, .csv)</span>
                  <input
                    type="file"
                    accept=".txt,.md,.json,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-zinc-500">or paste content directly below</span>
              </div>

              {/* Content Textarea */}
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-semibold text-zinc-300 mb-1.5">Document Content</label>
                <textarea
                  required
                  placeholder="Paste lecture text, formulas, definitions, chapter excerpts..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3.5 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !content.trim()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Save to Supabase & RAG</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
