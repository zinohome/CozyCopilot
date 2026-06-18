"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";
import { UploadDropzone } from "@/features/upload/UploadDropzone";
import { VoiceButton } from "@/features/voice/VoiceButton";
import type { UploadedFile } from "@/features/upload/useUpload";

export interface ComposerProps {
  onSend: (text: string) => Promise<void>;
  disabled: boolean;
  /**
   * If both are provided, a collapsible dropzone is rendered below the
   * textarea so users can attach files. The dropzone calls `onUploaded`
   * with the BFF's `{url, filename, size, mime}` payload — the parent
   * is responsible for actually wiring the URL into the next message
   * (e.g. as a markdown image or a `[file]` chip).
   */
  sessionId?: string;
  personalityId?: string;
  onUploaded?: (file: UploadedFile) => void;
  /**
   * M5.4: pass the active session/personality ids to enable the push-to-talk
   * voice button. When either is missing the button is rendered in a
   * disabled state. Defaults to `false` so existing callers don't have to
   * thread the ids through just to keep the legacy text-only behavior.
   */
  voiceEnabled?: boolean;
}

export function Composer({
  onSend,
  disabled,
  sessionId,
  personalityId,
  onUploaded,
  voiceEnabled = false,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const uploadsEnabled = Boolean(sessionId && personalityId && onUploaded);

  async function handleSend() {
    if (!text.trim() || sending || disabled) return;
    const msg = text;
    setText("");
    setSending(true);
    try {
      await onSend(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2 rounded-[var(--radius)] border border-border bg-bg p-2 shadow-[var(--shadow-soft)]">
        <textarea
          role="textbox"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder="说点什么..."
          rows={1}
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm focus-visible:outline-none disabled:opacity-50"
        />
        {voiceEnabled && (
          <VoiceButton sessionId={sessionId ?? null} personalityId={personalityId ?? null} />
        )}
        {uploadsEnabled && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            aria-label="toggle-attachments"
            aria-pressed={showUpload}
          >
            附件
          </Button>
        )}
        <Button onClick={handleSend} disabled={disabled || sending || !text.trim()}>
          发送
        </Button>
      </div>
      {uploadsEnabled && showUpload && (
        <UploadDropzone
          sessionId={sessionId!}
          personalityId={personalityId!}
          onUploaded={onUploaded!}
        />
      )}
    </div>
  );
}
