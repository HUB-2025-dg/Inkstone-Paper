import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, loadSettings, type InkstoneSettings } from './settings';
import { applyGlobalScope, clearScopeClasses, registerScopePostProcessor } from './scope';
import { registerRevealEffect, unloadRevealEffect } from './effects/reveal';
import { registerFocusEffect, unloadFocusEffect } from './effects/focus';
import { registerTypewriterCommand, unloadTypewriterEffect } from './effects/typewriter';

export default class InkstonePlugin extends Plugin {
	inkstoneSettings: InkstoneSettings = DEFAULT_SETTINGS;

	override async onload(): Promise<void> {
		await loadSettings(this);
		applyGlobalScope(this.inkstoneSettings);
		registerScopePostProcessor(this);
		// 动效层（PLAN §8）：均只在阅读域 .inkstone 作用域内生效（ADR-0003）
		registerRevealEffect(this);
		registerFocusEffect(this);
		registerTypewriterCommand(this);
	}

	override onunload(): void {
		unloadTypewriterEffect();
		unloadFocusEffect();
		unloadRevealEffect();
		clearScopeClasses();
	}
}
