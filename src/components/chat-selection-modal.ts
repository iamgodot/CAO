import { App, Notice, SuggestModal, TFile } from "obsidian";
import {
  getChatFiles,
  sortFilesByMtime,
  formatChatDisplayName,
} from "../utils/content";

export interface ChatFile {
  file: TFile;
  displayName: string;
}

export class ChatSelectionModal extends SuggestModal<ChatFile> {
  private chatFolderPath: string;
  private onSelect: (file: TFile) => void;

  constructor(
    app: App,
    chatFolderPath: string,
    onSelect: (file: TFile) => void,
  ) {
    super(app);
    this.chatFolderPath = chatFolderPath;
    this.onSelect = onSelect;
    this.setPlaceholder("Type to search chat files...");
  }

  getSuggestions(query: string): ChatFile[] {
    const chatFiles = getChatFiles(this.app, this.chatFolderPath);
    const sortedFiles = sortFilesByMtime(chatFiles);

    const items = sortedFiles.map((file) => ({
      file,
      displayName: formatChatDisplayName(file.basename),
    }));

    if (!query) {
      return items;
    }

    return items.filter((item) =>
      item.displayName.toLowerCase().includes(query.toLowerCase()),
    );
  }

  renderSuggestion(item: ChatFile, el: HTMLElement): void {
    const { displayName, file } = item;

    // Create main display text
    el.createEl("div", { text: displayName, cls: "suggestion-main-text" });

    // Create auxiliary info with last modified date
    const lastModified = new Date(file.stat.mtime).toLocaleString();
    el.createEl("div", {
      text: `Last modified: ${lastModified}`,
      cls: "suggestion-aux",
    });
  }

  onChooseSuggestion(item: ChatFile, evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item.file);
  }

  onOpen(): void {
    super.onOpen();

    // Check if there are any chat files
    const suggestions = this.getSuggestions("");
    if (suggestions.length === 0) {
      this.close();
      new Notice("No chats yet, try open a new chat");
    }
  }
}
