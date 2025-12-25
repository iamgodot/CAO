import { App, Editor, TFile } from "obsidian";

export function extractWikilinks(text: string): string[] {
  const wikiLinkRegex = /\[\[(.*?)\]\]/g;
  const matches = text.match(wikiLinkRegex) || [];
  return matches.map((match) => {
    // Extract content between [[ and ]]
    const linkContent = match.slice(2, -2);
    // If there's a pipe, take only the part before it (the actual link)
    const actualLink = linkContent.split("|")[0];
    return actualLink;
  });
}

export async function resolveWikilink(
  app: App,
  linkText: string,
): Promise<string | null> {
  // Remove display text if present (everything after the pipe)
  linkText = linkText.split("|")[0];
  // Parse link components (file, heading, block)
  let [fileName, subPath] = linkText.split("#");
  // Get file by name (checking both displayed name and path)
  const file = app.metadataCache.getFirstLinkpathDest(fileName, "");
  if (!file) {
    console.warn(`Could not find file: ${fileName}`);
    return null;
  }

  // TODO: use cachedRead instead because we're not modifying the content
  const fileContent = await app.vault.read(file);
  if (!subPath) {
    return fileContent;
  }

  const metadata = app.metadataCache.getFileCache(file);
  if (metadata?.headings && !subPath.startsWith("^")) {
    const heading = metadata.headings.find((h) => h.heading === subPath);
    if (heading) {
      // Extract the section (from this heading to the next heading of same or higher level)
      const headingIndex = fileContent.indexOf(
        "#".repeat(heading.level) + " " + heading.heading,
      );
      if (headingIndex !== -1) {
        // Find next heading of same or higher level
        const remainingContent = fileContent.slice(headingIndex);
        const nextHeadingRegex = new RegExp(`\\n#{1,${heading.level}}\\s`, "g");
        nextHeadingRegex.lastIndex = 1; // Start search after current heading
        const match = nextHeadingRegex.exec(remainingContent);
        const endIndex = match
          ? headingIndex + match.index
          : fileContent.length;
        return fileContent.slice(headingIndex, endIndex);
      }
    }
  }

  if (metadata?.blocks && subPath.startsWith("^")) {
    const blockId = subPath.slice(1); // Remove ^ prefix
    const blockPosition = metadata.blocks[blockId];
    if (blockPosition) {
      const lines = fileContent.split("\n");
      const start = blockPosition.position.start.line;
      const end = blockPosition.position.end.line;
      return lines.slice(start, end + 1).join("\n");
    }
  }

  return null;
}

export function setCursorToEnd(editor: Editor): void {
  const lastLine = editor.lastLine();
  editor.setCursor(lastLine, editor.getLine(lastLine).length);
}

export function renderText(editor: Editor, text: string): void {
  const lastLine = editor.lastLine();
  const pos = {
    line: lastLine,
    ch: editor.getLine(lastLine).length,
  };
  editor.replaceRange(text, pos);
  editor.scrollIntoView({ from: pos, to: pos }, true);
}

export function getChatFiles(app: App, chatFolderPath: string) {
  return app.vault
    .getMarkdownFiles()
    .filter(
      (file) =>
        file.path.startsWith(chatFolderPath + "/") && file.extension === "md",
    );
}

export function sortFilesByMtime<T extends { stat: { mtime: number } }>(
  files: T[],
): T[] {
  return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
}

export function formatChatDisplayName(fileName: string): string {
  // Remove .md extension and return clean display name
  return fileName.replace(/\.md$/, "");
}
