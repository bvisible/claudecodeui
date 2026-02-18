import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { PermissionPanelProps } from '../../configs/permissionPanelRegistry';

interface AllowedPrompt {
  tool: string;
  prompt: string;
}

export const ExitPlanModePanel: React.FC<PermissionPanelProps> = ({
  request,
  onDecision,
}) => {
  const input = request.input as { allowedPrompts?: AllowedPrompt[] } | undefined;
  const allowedPrompts: AllowedPrompt[] = input?.allowedPrompts || [];

  const [mounted, setMounted] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const rejectInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (showRejectInput) {
      rejectInputRef.current?.focus();
    }
  }, [showRejectInput]);

  const handleAccept = useCallback(() => {
    onDecision(request.requestId, { allow: true, updatedInput: input });
  }, [onDecision, request.requestId, input]);

  const handleReject = useCallback(() => {
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    const feedback = rejectFeedback.trim() || 'Plan rejected by user';
    onDecision(request.requestId, { allow: false, message: feedback });
  }, [onDecision, request.requestId, showRejectInput, rejectFeedback]);

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
            {/* Plan icon */}
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

          <p className="text-[14px] leading-snug font-medium text-gray-900 dark:text-gray-100">
            Claude has finished planning. Accept to start implementation, or reject with feedback.
          </p>
        </div>

        {/* Requested permissions */}
        {allowedPrompts.length > 0 && (
          <div className="px-4 pb-2">
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Permissions requested for implementation:
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
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

        {/* Reject feedback input */}
        {showRejectInput && (
          <div className="px-4 pb-2">
            <textarea
              ref={rejectInputRef}
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleReject();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowRejectInput(false);
                  setRejectFeedback('');
                }
              }}
              placeholder="What should Claude change in the plan?"
              rows={2}
              className="w-full text-[13px] rounded-lg border-0 bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none ring-1 ring-red-200 dark:ring-red-800 focus:ring-2 focus:ring-red-400 dark:focus:ring-red-500 placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-shadow duration-200 resize-none"
            />
            <div className="flex items-center gap-1 mt-1">
              <kbd className="text-[9px] font-mono text-gray-300 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                Enter
              </kbd>
              <span className="text-[9px] text-gray-400">send</span>
              <kbd className="text-[9px] font-mono text-gray-300 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700 ml-2">
                Esc
              </kbd>
              <span className="text-[9px] text-gray-400">cancel</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleReject}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-3.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {showRejectInput ? 'Send feedback' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 dark:from-indigo-500 dark:to-indigo-600 text-white shadow-sm hover:shadow-md transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Accept plan
          </button>
        </div>
      </div>
    </div>
  );
};
