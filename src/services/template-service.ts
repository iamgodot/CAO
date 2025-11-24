import { Editor, EditorPosition } from "obsidian";
import { PromptTemplate } from "../types";

export class TemplateService {
	insertTemplate(editor: Editor, template: PromptTemplate): void {
		const cursorPos = editor.getCursor();
		const templateText = template.template;
		this.positionCursorInTemplate(editor, cursorPos, templateText);
	}

	private positionCursorInTemplate(
		editor: Editor,
		insertPos: EditorPosition,
		templateText: string,
	): void {
		const cursorPlaceholder = "{cursor}";
		const placeholderIndex = templateText.indexOf(cursorPlaceholder);

		if (placeholderIndex !== -1) {
			// Calculate cursor position relative to insert point
			const beforeCursor = templateText.substring(0, placeholderIndex);
			const lines = beforeCursor.split("\n");

			const finalLine = insertPos.line + lines.length - 1;
			const finalCh =
				lines.length === 1
					? insertPos.ch + lines[0].length
					: lines[lines.length - 1].length;

			// Insert template without placeholder
			const cleanTemplate = templateText.replace(cursorPlaceholder, "");
			editor.replaceRange(cleanTemplate, insertPos);

			// Position cursor
			editor.setCursor(finalLine, finalCh);
		} else {
			// No cursor placeholder, insert template and position at end
			editor.replaceRange(templateText, insertPos);

			const lines = templateText.split("\n");
			const finalLine = insertPos.line + lines.length - 1;
			const finalCh =
				lines.length === 1
					? insertPos.ch + lines[0].length
					: lines[lines.length - 1].length;

			editor.setCursor(finalLine, finalCh);
		}
	}
}