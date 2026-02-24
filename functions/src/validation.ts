import type { ChatMessage } from "./types";

export interface ValidationResult {
  valid: boolean;
  status?: number;
  error?: string;
}

export function validateChatRequest(body: Record<string, unknown>): ValidationResult {
  const messages = body.messages as ChatMessage[] | undefined;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      valid: false,
      status: 400,
      error: "Missing or invalid 'messages' field. Provide an array of {role, content} message objects.",
    };
  }

  for (const msg of messages) {
    if (!msg.role || !["user", "assistant"].includes(msg.role)) {
      return {
        valid: false,
        status: 400,
        error: "Each message must have a role of 'user' or 'assistant'.",
      };
    }
    if (!msg.content || typeof msg.content !== "string") {
      return {
        valid: false,
        status: 400,
        error: "Each message must have a non-empty 'content' string.",
      };
    }
  }

  if (messages[messages.length - 1].role !== "user") {
    return {
      valid: false,
      status: 400,
      error: "The last message must be from the user.",
    };
  }

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars > 50000) {
    return {
      valid: false,
      status: 400,
      error: "Conversation too long. Maximum 50,000 characters total.",
    };
  }

  return { valid: true };
}
