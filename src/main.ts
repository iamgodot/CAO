import { Plugin } from "obsidian";
import { CAOSettingTab, DEFAULT_SETTINGS } from "./settings";
import { CAOSettings } from "./types";
import { AIClientService } from "./services/ai-client-service";
import { ChatService } from "./services/chat-service";
import { ResponseService } from "./services/response-service";
import { TemplateService } from "./services/template-service";
import { CommandService } from "./services/command-service";

export default class CAO extends Plugin {
	settings: CAOSettings;

	private aiClientService: AIClientService;
	private chatService: ChatService;
	private responseService: ResponseService;
	private templateService: TemplateService;
	private commandService: CommandService;

	private initializeServices(): void {
		this.aiClientService = new AIClientService(this.settings);
		this.chatService = new ChatService(this.app, this.settings);
		this.responseService = new ResponseService(this.aiClientService, this.settings);
		this.templateService = new TemplateService();
		this.commandService = new CommandService(
			this.app,
			this,
			this.settings,
			this.chatService,
			this.responseService,
			this.templateService,
		);
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.initializeServices();
		this.addSettingTab(new CAOSettingTab(this.app, this));
		this.commandService.registerCommands();
	}


	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		let needsSave = false;

		// Migration from v1.3.1 to v1.4.0: transfer old settings to new structure
		if (data?.apiKey && !data?.anthropicApiKey) {
			this.settings.anthropicApiKey = data.apiKey;
			this.settings.provider = "anthropic";
			needsSave = true;
		}
		if (data?.model && !data?.anthropicModel) {
			this.settings.anthropicModel = data.model;
			needsSave = true;
		}

		// Save migrated settings
		if (needsSave) {
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);

		// Update all services with new settings
		this.aiClientService.updateSettings(this.settings);
		this.commandService.updateSettings(this.settings);
		this.commandService.updatePromptCommands(this.settings.customPrompts);
	}
}
