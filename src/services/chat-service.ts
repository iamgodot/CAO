import { App, MarkdownView, Notice, TFile } from "obsidian";
import { format } from "date-fns";
import { formatNewUserSection, setCursorToEnd } from "../utils";
import { CAOSettings } from "../types";
import { ChatSelectionModal } from "../chat-selection-modal";

export class ChatService {
	private app: App;
	private settings: CAOSettings;

	constructor(app: App, settings: CAOSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: CAOSettings): void {
		this.settings = settings;
	}

	async openNewChat(): Promise<void> {
		const formattedDateTime = format(new Date(), "yyyy-MM-dd HH-mm-ss");
		const filename = `Chat ${formattedDateTime}.md`;
		const folderPath = this.settings.chatFolderPath;

		if (!(await this.app.vault.adapter.exists(folderPath))) {
			await this.app.vault.createFolder(folderPath);
		}

		const filePath = `${folderPath}/${filename}`;
		const file = await this.app.vault.create(
			filePath,
			formatNewUserSection(this.settings.useCallouts, true),
		);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);

		const view = leaf.view;
		if (view instanceof MarkdownView) {
			setCursorToEnd(view.editor);
		}
	}

	async openLastChat(): Promise<void> {
		const folderPath = this.settings.chatFolderPath;
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			new Notice("CAO folder not found");
			return;
		}

		const files = this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith(folderPath + "/"))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);

		if (files.length === 0) {
			new Notice("No chats yet");
			return;
		}

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(files[0]);
	}

	async selectChat(): Promise<void> {
		const folderPath = this.settings.chatFolderPath;
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			new Notice("CAO folder not found");
			return;
		}

		const modal = new ChatSelectionModal(
			this.app,
			folderPath,
			async (selectedFile: TFile) => {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(selectedFile);
			},
		);
		modal.open();
	}
}