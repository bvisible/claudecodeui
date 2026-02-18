import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { PermissionPanelProps } from '../../configs/permissionPanelRegistry';

interface AllowedPrompt {
  tool: string;
  prompt: string;
}

type PlanOption = 'bypass' | 'acceptEdits' | 'feedback';

export const ExitPlanModePanel: React.FC<PermissionPanelProps> = ({
  request,
  onDecision,
}) => {
  const input = request.input as { allowedPrompts?: AllowedPrompt[] } | undefined;
  const allowedPrompts: AllowedPrompt[] = input?.allowedPrompts || [];

  const [mounted, setMounted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<PlanOption>('bypass');
  const [feedback, setFeedback] = useState('');
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (selectedOption === 'feedback') {
      feedbackRef.current?.focus();
    }
  }, [selectedOption]);

  const handleSubmit = useCallback(() => {
    if (selectedOption === 'bypass') {
      onDecision(request.requestId, {
        allow: true,
        updatedInput: input,
        permissionMode: 'bypassPermissions',
      });
    } else if (selectedOption === 'acceptEdits') {
      onDecision(request.requestId, {
        allow: true,
        updatedInput: input,
        permissionMode: 'acceptEdits',
      });
    } else if (selectedOption === 'feedback') {
      const msg = feedback.trim() || 'Plan rejected by user';
      onDecision(request.requestId, { allow: false, message: msg });
    }
  }, [onDecision, request.requestId, input, selectedOption, feedback]);

  const options: { value: PlanOption; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'bypass',
      label: 'Yes, and bypass permissions',
      description: 'Auto-approve all tool usage during implementation',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
    },
    {
      value: 'acceptEdits',
      label: 'Yes, manually approve edits',
      description: 'Approve each file edit individually',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      ),
    },
    {
      value: 'feedback',
      label: 'Tell Claude what to change',
      description: 'Reject with feedback to revise the plan',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={`w-full outline-none transition-all duration-500 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 dark:border-indigo-700/50 bg-white dark:bg-gray-800/90 shadow-lg dark:shadow-2xl">
        {/* Accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-purple-400 to-violet-400" />

        {/* Header */}
        <div className="px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="relative flex-shrink-0">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-400/15 dark:to-purple-400/15 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75" />
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500 animate-pulse" />
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[10px] font-medium tracking-wide uppercase text-gray-400 dark:text-gray-500">
                Plan ready for review
              </span>
              <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                Plan mode
              </span>
            </div>
          </div>

          <p className="text-[13px] leading-snug text-gray-700 dark:text-gray-300">
            Claude has written up a plan and is ready to execute. Would you like to proceed?
          </p>
        </div>

        {/* Requested permissions */}
        {allowedPrompts.length > 0 && (
          <div className="px-4 pb-2">
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Permissions requested for implementation:
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin">
              {allowedPrompts.map((prompt, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/50"
                >
                  <span className="flex-shrink-0 text-[10px] font-mono font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded mt-px">
                    {prompt.tool}
                  </span>
                  <span className="text-[12px] text-gray-700 dark:text-gray-300 leading-snug">
                    {prompt.prompt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="px-4 pb-2 space-y-1.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedOption(option.value)}
              className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                selectedOption === option.value
                  ? 'bg-indigo-50 dark:bg-indigo-900/25 border border-indigo-300 dark:border-indigo-600 ring-1 ring-indigo-200 dark:ring-indigo-700'
                  : 'bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
              }`}
            >
              <div className={`flex-shrink-0 mt-0.5 ${
                selectedOption === option.value
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {selectedOption === option.value ? (
                  <div className="w-4 h-4 rounded-full border-2 border-indigo-500 dark:border-indigo-400 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`flex items-center gap-1.5 text-[12px] font-medium ${
                  selectedOption === option.value
                    ? 'text-indigo-900 dark:text-indigo-100'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  <span className={selectedOption === option.value ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}>
                    {option.icon}
                  </span>
                  {option.label}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Feedback textarea (shown when feedback option selected) */}
        {selectedOption === 'feedback' && (
          <div className="px-4 pb-2">
            <textarea
              ref={feedbackRef}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="What should Claude change in the plan?"
              rows={2}
              className="w-full text-[13px] rounded-lg border-0 bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none ring-1 ring-indigo-200 dark:ring-indigo-800 focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-shadow duration-200 resize-none"
            />
            <div className="flex items-center gap-1 mt-1">
              <kbd className="text-[9px] font-mono text-gray-300 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                Enter
              </kbd>
              <span className="text-[9px] text-gray-400">send</span>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-4 py-1.5 rounded-lg transition-all duration-200 ${
              selectedOption === 'feedback'
                ? 'bg-gradient-to-r from-red-600 to-red-500 dark:from-red-500 dark:to-red-600 text-white shadow-sm hover:shadow-md'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-500 dark:from-indigo-500 dark:to-indigo-600 text-white shadow-sm hover:shadow-md'
            }`}
          >
            {selectedOption === 'feedback' ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                Send feedback
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Accept plan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
