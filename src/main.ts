import { MarkdownView, Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	InkstoneSettingTab,
	loadSettings,
	saveSettings,
	type InkstoneSettings,
	type SettingsController,
} from './settings';
import {
	applyGlobalScope,
	applyTypographyOverrides,
	clearBodyOverrides,
	clearScopeClasses,
	registerScopePostProcessor,
} from './scope';
import { registerRevealEffect, unloadRevealEffect } from './effects/reveal';
import { registerFocusEffect, unloadFocusEffect } from './effects/focus';
import { registerTypewriterCommand, unloadTypewriterEffect } from './effects/typewriter';

export default class InkstonePlugin extends Plugin implements SettingsController {
	inkstoneSettings: InkstoneSettings = DEFAULT_SETTINGS;

	override async onload(): Promise<void> {
		await loadSettings(this);
		this.refreshRuntime(false);
		registerScopePostProcessor(this);
		// 动效层（PLAN §8）：均只在阅读域 .inkstone 作用域内生效（ADR-0003）
		registerRevealEffect(this);
		registerFocusEffect(this);
		registerTypewriterCommand(this);
		// 设置面板（PLAN §10 步骤 6）
		this.addSettingTab(new InkstoneSettingTab(this.app, this));
		// 主题切换等 CSS 变更会改变暗色门控的判定：重算 body 作用域并重渲染阅读视图
		this.registerEvent(this.app.workspace.on('css-change', () => this.refreshRuntime(true)));
	}

	override onunload(): void {
		unloadTypewriterEffect();
		unloadFocusEffect();
		unloadRevealEffect();
		clearScopeClasses();
		clearBodyOverrides();
	}

	/** 设置面板回调入口（SettingsController）：写入 data.json 并使全部设置即时生效。 */
	applySettings(): void {
		void saveSettings(this);
		this.refreshRuntime(true);
	}

	/**
	 * 重算 body 级作用域与排版覆盖（字体/缩放/栏宽经 CSS 变量与类即时生效，
	 * 无需重渲染）；关停中的动效立即清理观察器与残留类；rerender 为 true 时
	 * 重渲染打开的阅读视图，使作用域/纸张/暗色门控按最新设置重新解析。
	 */
	private refreshRuntime(rerender: boolean): void {
		applyGlobalScope(this.inkstoneSettings);
		applyTypographyOverrides(this.inkstoneSettings);
		const off = !this.inkstoneSettings.enabled;
		const { effectsEnabled, revealEnabled, focusEnabled, typewriterEnabled } = this.inkstoneSettings;
		if (off || !effectsEnabled || !revealEnabled) unloadRevealEffect();
		if (off || !effectsEnabled || !focusEnabled) unloadFocusEffect();
		if (off || !effectsEnabled || !typewriterEnabled) unloadTypewriterEffect();
		if (rerender) this.rerenderReadingViews();
	}

	/** 重渲染全部打开的阅读视图（全量，触发 post-processor 重新解析 frontmatter）。 */
	private rerenderReadingViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			// MarkdownView 非 DOM Node，用 instanceof（.instanceOf 只在 Node/Event 上有声明）
			if (view instanceof MarkdownView && view.getMode() === 'preview') {
				view.previewMode.rerender(true);
			}
		}
	}
}
