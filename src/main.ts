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

/**
 * 字体接入说明（PLAN §4/§5）：打包 OFL 字体的 @font-face 声明在 styles.css 顶部，
 * src 为相对 url('fonts/…')，随样式表基址解析（桌面 app://、移动端随样式表协议），
 * 字体文件装配于插件目录 fonts/（assets/fonts → 拷入，与 main.js/styles.css 同级）。
 * 不采用 JS 注入 <style>：eslint-plugin-obsidianmd no-forbidden-elements 禁止创建
 * style/link 元素，且 eslint-comments/no-restricted-disable 连豁免也禁止；亦不采用
 * data URI：24.9MB TTF 转 base64 会使 styles.css 膨胀至约 35MB，违背体积优先。
 * 禁用插件时 Obsidian 卸载插件样式表，字体声明随之移除，零残留；文件缺失时回退
 * styles.css 的本机字体栈。族名字符串以字体文件 name 表为准（"LXGW WenKai Screen"
 * 已解析 name 表确认；'JetBrains Mono' 为上游官方族名）。
 */
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
