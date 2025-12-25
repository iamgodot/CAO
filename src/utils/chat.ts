import { App } from "obsidian";
import { ChatMessage, ChatFormatValidation } from "../types/content";
import {
  CURSOR_PLACEHOLDER,
  CALLOUT_USER_PREFIX,
  CALLOUT_AI_PREFIX,
  HEADER_USER_PREFIX,
  HEADER_AI_PREFIX,
} from "./constants";
import { extractWikilinks, resolveWikilink } from "./content";

async function parseUserPrompt(
  app: App,
  userQuery: string,
  processedWikilinks: Set<string> = new Set(),
): Promise<string> {
  let userPrompt = `User query: ${userQuery}`;
  const wikilinks = extractWikilinks(userQuery);
  for (const wikilink of wikilinks) {
    // Skip if this wikilink has already been processed
    if (processedWikilinks.has(wikilink)) continue;

    const resolvedContent = await resolveWikilink(app, wikilink);
    if (resolvedContent) {
      userPrompt += `\n\nContext from [[${wikilink}]]:\n${resolvedContent}`;
      // Mark this wikilink as processed
      processedWikilinks.add(wikilink);
    }
  }
  return userPrompt;
}

export async function parseChat(
  app: App,
  text: string,
): Promise<ChatMessage[] | null> {
  const lines = text.split("\n");
  const messages: ChatMessage[] = [];
  let currentMessage: Partial<ChatMessage> | null = null;
  let content: string[] = [];
  let inCallout = false; // Track if we're inside a callout block
  // Track which wikilinks have already been processed
  const processedWikilinks = new Set<string>();

  for (const line of lines) {
    // Check for header format (legacy)
    if (line.startsWith(HEADER_USER_PREFIX)) {
      if (currentMessage) {
        currentMessage.content = [
          {
            type: "text" as const,
            content: content.join("\n").trim(),
          },
        ];
        messages.push(currentMessage as ChatMessage);
      }
      currentMessage = { role: "user", content: [] };
      content = [];
      inCallout = false;
    } else if (line.startsWith(HEADER_AI_PREFIX)) {
      if (currentMessage) {
        const userQuery = content.join("\n").trim();
        const processedContent = await parseUserPrompt(
          app,
          userQuery,
          processedWikilinks,
        );
        currentMessage.content = [
          {
            type: "text" as const,
            content: processedContent,
          },
        ];
        messages.push(currentMessage as ChatMessage);
      }
      currentMessage = { role: "assistant", content: [] };
      content = [];
      inCallout = false;
    }
    // Check for callout format
    else if (line.startsWith(CALLOUT_USER_PREFIX)) {
      if (currentMessage) {
        let processedContent = content.join("\n").trim();
        // Remove callout prefixes if we were in a callout
        if (inCallout) {
          processedContent = content
            .map((l) => (l.startsWith("> ") ? l.slice(2) : l))
            .join("\n")
            .trim();
        }
        currentMessage.content = [
          {
            type: "text" as const,
            content: processedContent,
          },
        ];
        messages.push(currentMessage as ChatMessage);
      }
      currentMessage = { role: "user", content: [] };
      content = [];
      inCallout = true;
    } else if (line.startsWith(CALLOUT_AI_PREFIX)) {
      if (currentMessage) {
        let processedContent = content.join("\n").trim();
        // Remove callout prefixes if we were in a callout, then parse wikilinks
        if (inCallout) {
          processedContent = content
            .map((l) => (l.startsWith("> ") ? l.slice(2) : l))
            .join("\n")
            .trim();
        }
        const finalProcessedContent = await parseUserPrompt(
          app,
          processedContent,
          processedWikilinks,
        );
        currentMessage.content = [
          {
            type: "text" as const,
            content: finalProcessedContent,
          },
        ];
        messages.push(currentMessage as ChatMessage);
      }
      currentMessage = { role: "assistant", content: [] };
      content = [];
      inCallout = true;
    } else {
      content.push(line);
    }
  }

  // Add the last message
  if (currentMessage) {
    let processedContent = content.join("\n").trim();
    // Remove callout prefixes if we were in a callout, then parse wikilinks
    if (inCallout) {
      processedContent = content
        .map((l) => (l.startsWith("> ") ? l.slice(2) : l))
        .join("\n")
        .trim();
    }
    const lastProcessedContent = await parseUserPrompt(
      app,
      processedContent,
      processedWikilinks,
    );
    currentMessage.content = [
      {
        type: "text" as const,
        content: lastProcessedContent,
      },
    ];
    messages.push(currentMessage as ChatMessage);
  }

  // Validate the chat format
  for (let i = 0; i < messages.length; i++) {
    if (i % 2 === 0 && messages[i].role !== "user") return null;
    if (i % 2 === 1 && messages[i].role !== "assistant") return null;
  }

  return messages;
}

export async function validateChatFormat(
  text: string,
  useCallouts: boolean,
): Promise<ChatFormatValidation> {
  const detectedFormat = detectChatFormat(text);

  if (detectedFormat === "mixed") {
    return {
      isValid: false,
      error: {
        type: "format",
        message:
          "This chat contains mixed formatting (both headers and callouts).",
      },
    };
  }

  if (detectedFormat === "empty") {
    return {
      isValid: false,
      error: {
        type: "format",
        message: "No valid formatting found (headers or callouts).",
      },
    };
  }

  if (detectedFormat === "headers" && useCallouts) {
    return {
      isValid: false,
      error: {
        type: "format",
        message:
          'This chat uses header format, please disable "Use callouts for chat formatting" in settings to continue.',
      },
    };
  }

  if (detectedFormat === "callouts" && !useCallouts) {
    return {
      isValid: false,
      error: {
        type: "format",
        message:
          'This chat uses callout format, please enable "Use callouts for chat formatting" in settings to continue.',
      },
    };
  }

  const hasContent = text
    .split("\n")
    .some(
      (line) =>
        !line.startsWith(HEADER_USER_PREFIX) &&
        !line.startsWith(HEADER_AI_PREFIX) &&
        !line.startsWith(CALLOUT_USER_PREFIX) &&
        !line.startsWith(CALLOUT_AI_PREFIX) &&
        line.trim().length > 0,
    );

  if (!hasContent) {
    return {
      isValid: false,
      error: {
        type: "empty_message",
        message: "Query message is empty.",
      },
    };
  }

  return {
    isValid: true,
    format: detectedFormat as "headers" | "callouts",
  };
}

export function detectChatFormat(
  text: string,
): "headers" | "callouts" | "mixed" | "empty" {
  const lines = text.split("\n");

  let hasHeaders = false;
  let hasCallouts = false;

  for (const line of lines) {
    if (
      line.startsWith(HEADER_USER_PREFIX) ||
      line.startsWith(HEADER_AI_PREFIX)
    ) {
      hasHeaders = true;
    } else if (
      line.startsWith(CALLOUT_USER_PREFIX) ||
      line.startsWith(CALLOUT_AI_PREFIX)
    ) {
      hasCallouts = true;
    }

    if (hasHeaders && hasCallouts) {
      return "mixed";
    }
  }

  if (hasHeaders) {
    return "headers";
  } else if (hasCallouts) {
    return "callouts";
  } else {
    return "empty";
  }
}

export function formatNewUserSection(
  useCallouts: boolean,
  forNewFile: boolean = false,
): string {
  const prefix = forNewFile ? "" : "\n\n";
  if (useCallouts) {
    return prefix + CALLOUT_USER_PREFIX + "\n> ";
  } else {
    return prefix + HEADER_USER_PREFIX + "\n";
  }
}

export function formatNewAISection(useCallouts: boolean): string {
  if (useCallouts) {
    return "\n\n" + CALLOUT_AI_PREFIX + "\n";
  } else {
    return "\n\n" + HEADER_AI_PREFIX + "\n";
  }
}

// Process content for callout format by adding "> " prefix to all lines
export function processCalloutContent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");
}

// Process streaming chunks for callout format
export function processStreamingCalloutContent(
  chunk: string,
  isStartOfLine: boolean,
): { processedChunk: string; newIsStartOfLine: boolean } {
  if (!chunk) return { processedChunk: chunk, newIsStartOfLine: isStartOfLine };

  let processedChunk = "";
  let newIsStartOfLine = isStartOfLine;

  for (let i = 0; i < chunk.length; i++) {
    const char = chunk[i];

    if (newIsStartOfLine) {
      processedChunk += "> ";
    }

    processedChunk += char;

    newIsStartOfLine = char === "\n";
  }

  return { processedChunk, newIsStartOfLine };
}
