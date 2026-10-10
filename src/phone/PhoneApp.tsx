import React, { useCallback, useState } from 'react';
import { PhoneAssistant } from './PhoneAssistant';
import { PhoneVoiceMode } from './PhoneVoiceMode';
import { PhoneSidebarDrawer } from './PhoneSidebarDrawer';
import { SettingsModal } from '../components/settings/SettingsModal';
import { UserProfile } from '@/types';
import { useChat } from '@/hooks/useChat';

interface PhoneAppProps {
  user: UserProfile;
  onSignOut: () => void;
  onUpdateUser: (user: UserProfile) => void;
}

export const PhoneApp: React.FC<PhoneAppProps> = ({ user, onSignOut, onUpdateUser }) => {
  const chat = useChat(user);

  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSendMessage = useCallback(
    (text: string, image?: string) => {
      void chat.sendMessage(text, image);
    },
    [chat.sendMessage]
  );
  const closeVoiceMode = useCallback(() => setIsVoiceModeOpen(false), []);

  if (isVoiceModeOpen) {
    return (
      <div className="h-full w-full overflow-hidden bg-[#07080e]">
        <PhoneVoiceMode onClose={closeVoiceMode} onVoiceTranscription={handleSendMessage} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#07080e]">
      <PhoneAssistant
        user={user}
        messages={chat.messages}
        isGenerating={chat.isGenerating}
        onSendMessage={handleSendMessage}
        subjectId={chat.subjectId}
        onSubjectChange={chat.setSubjectId}
        onOpenVoiceMode={() => setIsVoiceModeOpen(true)}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      <PhoneSidebarDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={user}
        threads={chat.threads}
        activeThreadId={chat.activeThreadId}
        onSelectThread={chat.setActiveThreadId}
        onNewChat={chat.startNewChat}
        onDeleteThread={(id) => void chat.deleteThread(id)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={onSignOut}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
        onDeleteAllChats={chat.clearAllChats}
        onSyncSupabase={chat.reloadFromStorage}
      />
    </div>
  );
};
