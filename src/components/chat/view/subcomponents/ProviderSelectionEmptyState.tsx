import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SessionProviderLogo from '../../../SessionProviderLogo';
import NextTaskBanner from '../../../NextTaskBanner.jsx';
import { CLAUDE_MODELS } from '../../../../../shared/modelConstants';
import type { ProjectSession } from '../../../../types/app';

interface ProviderSelectionEmptyStateProps {
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  provider: string;
  setProvider: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  claudeModel: string;
  setClaudeModel: (model: string) => void;
  cursorModel?: string;
  setCursorModel?: (model: string) => void;
  codexModel?: string;
  setCodexModel?: (model: string) => void;
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  onShowAllTasks?: (() => void) | null;
  setInput: React.Dispatch<React.SetStateAction<string>>;
}

// Frappe integration: Claude only (cursor/codex removed)
export default function ProviderSelectionEmptyState({
  selectedSession,
  currentSessionId,
  claudeModel,
  setClaudeModel,
  tasksEnabled,
  isTaskMasterInstalled,
  onShowAllTasks,
  setInput,
}: ProviderSelectionEmptyStateProps) {
  const { t } = useTranslation('chat');
  const nextTaskPrompt = t('tasks.nextTaskPrompt', { defaultValue: 'Start the next task' });

  const handleModelChange = (value: string) => {
    setClaudeModel(value);
    localStorage.setItem('claude-model', value);
  };

  /* New session — model picker (Claude only) */
  if (!selectedSession && !currentSessionId) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="text-center mb-8">
            <SessionProviderLogo className="w-12 h-12 mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
              {t('providerSelection.title')}
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              {t('providerSelection.description')}
            </p>
          </div>

          {/* Model picker */}
          <div className="transition-all duration-200 opacity-100 translate-y-0">
            <div className="flex items-center justify-center gap-2 mb-5">
              <span className="text-sm text-muted-foreground">{t('providerSelection.selectModel')}</span>
              <div className="relative">
                <select
                  value={claudeModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  tabIndex={-1}
                  className="appearance-none pl-3 pr-7 py-1.5 text-sm font-medium bg-muted/50 border border-border/60 rounded-lg text-foreground cursor-pointer hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {CLAUDE_MODELS.OPTIONS.map(({ value, label }: { value: string; label: string }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground/70">
              {t('providerSelection.readyPrompt.claude', { model: claudeModel })}
            </p>
          </div>

          {/* Task banner */}
          {tasksEnabled && isTaskMasterInstalled && (
            <div className="mt-5">
              <NextTaskBanner onStartTask={() => setInput(nextTaskPrompt)} onShowAllTasks={onShowAllTasks} />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* Existing session — continue prompt */
  if (selectedSession) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center px-6 max-w-md">
          <p className="text-lg font-semibold text-foreground mb-1.5">{t('session.continue.title')}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{t('session.continue.description')}</p>

          {tasksEnabled && isTaskMasterInstalled && (
            <div className="mt-5">
              <NextTaskBanner onStartTask={() => setInput(nextTaskPrompt)} onShowAllTasks={onShowAllTasks} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
