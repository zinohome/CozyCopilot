"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";

export interface ComposerProps {
  onSend: (text: string) => Promise<void>;
  disabled: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

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
      <Button onClick={handleSend} disabled={disabled || sending || !text.trim()}>
        发送
      </Button>
    </div>
  );
}
