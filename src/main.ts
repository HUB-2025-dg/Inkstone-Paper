import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, loadSettings, type InkstoneSettings } from './settings';
import { applyGlobalScope, clearScopeClasses, registerScopePostProcessor } from './scope';

export default class InkstonePlugin extends Plugin {
	inkstoneSettings: InkstoneSettings = DEFAULT_SETTINGS;

	override async onload(): Promise<void> {
		await loadSettings(this);
		applyGlobalScope(this.inkstoneSettings);
		registerScopePostProcessor(this);
	}

	override onunload(): void {
		clearScopeClasses();
	}
}
