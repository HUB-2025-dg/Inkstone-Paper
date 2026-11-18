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
 * 字体文件装配于插件目录 fonts/（assets/fonts → 拷入，与 main.js/styles.css 同级，
 * npm run build 末尾自动拷贝）。不采用 JS 注入 <style>：eslint-plugin-obsidianmd
 * no-forbidden-elements 禁止创建 style/link 元素，且 eslint-comments/
 * no-restricted-disable 连豁免也禁止；亦不采用 data URI：24.9MB TTF 转 base64
 * 会使 styles.css 膨胀至约 35MB，违背体积优先。禁用插件时 Obsidian 卸载插件
 * 样式表，字体声明随之移除，零残留；文件缺失时回退 styles.css 的本机字体栈。
 * 族名字符串以字体文件 name 表为准（"LXGW WenKai Screen" 已解析 name 表确认；
 * 'JetBrains Mono' 为上游官方族名）。
 */

/** 落盘去抖窗口（ms）：滑杆连续 onChange 只在停顿后写一次 data.json（复审第 1 轮 §1）。 */
const SAVE_DEBOUNCE_MS = 400;

/** 变更后需要重渲染阅读视图的设置键：作用域类（全局开关/暗色门控/纸张）与
 *  观察器附着（效果总开关/渐显/聚焦）随渲染解析；其余设置全部经 body 类与
 *  CSS 变量即时生效，无需重渲染（styles.css ①⑦，复审第 1 轮 §1）。 */
const RERENDER_KEYS = [
	'enabled',
	'darkModeEnabled',
	'paperStyle',
	'effectsEnabled',
	'revealEnabled',
	'focusEnabled',
] as const;

export default class InkstonePlugin extends Plugin implements SettingsController {
	inkstoneSettings: InkstoneSettings = DEFAULT_SETTINGS;

	/** 上次运行时的作用域签名（RERENDER_KEYS 取值串）：检测作用域级设置是否变化。 */
	private lastScopeSignature: string | null = null;
	/** 去抖落盘计时器句柄（window.setTimeout 返回 number）。 */
	private saveTimer: number | null = null;

	override async onload(): Promise<void> {
		await loadSettings(this);
		this.refreshRuntime();
		registerScopePostProcessor(this);
		// 动效层（PLAN §8）：均只在阅读域 .inkstone 作用域内生效（ADR-0003）
		registerRevealEffect(this);
		registerFocusEffect(this);
		registerTypewriterCommand(this);
		// 设置面板（PLAN §10 步骤 6）
		this.addSettingTab(new InkstoneSettingTab(this.app, this));
		// 主题切换等 CSS 变更会改变暗色门控的判定：重算 body 作用域并重渲染阅读视图
		this.registerEvent(this.app.workspace.on('css-change', () => this.refreshRuntime(true)));
		// 弹窗窗口有独立 body/document（复审第 1 轮 §5）：新弹窗打开与布局变化时
		// 重铺 body 级镜像；作用域签名未变化，不会触发阅读视图重渲染
		this.registerEvent(this.app.workspace.on('window-open', () => this.refreshRuntime()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshRuntime()));
	}

	override onunload(): void {
		// 去抖中的落盘立即补写（禁用插件时保住最后一次设置变更）
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void saveSettings(this);
		}
		unloadTypewriterEffect();
		unloadFocusEffect(this);
		unloadRevealEffect(this);
		clearScopeClasses(this);
		clearBodyOverrides(this);
	}

	/** 设置面板回调入口（SettingsController）：重算运行时并去抖落盘；
	 *  是否重渲染阅读视图由作用域签名自动判定（见 refreshRuntime）。 */
	applySettings(): void {
		this.refreshRuntime();
		this.scheduleSaveSettings();
	}

	/**
	 * 重算 body 级作用域与排版覆盖（主窗口 + 弹窗逐窗口执行）：字体/缩放/
	 * 栏宽经 CSS 变量与类即时生效，无需重渲染；关停中的动效立即清理观察器
	 * 与残留类。仅当作用域签名（RERENDER_KEYS）相对上次变化时重渲染打开的
	 * 阅读视图，使作用域/纸张/暗色门控按最新设置重新解析；forceRerender
	 * 跳过签名比对（css-change 等环境性变更）。
	 */
	private refreshRuntime(forceRerender = false): void {
		applyGlobalScope(this);
		applyTypographyOverrides(this);
		const off = !this.inkstoneSettings.enabled;
		const { effectsEnabled, revealEnabled, focusEnabled, typewriterEnabled } = this.inkstoneSettings;
		if (off || !effectsEnabled || !revealEnabled) unloadRevealEffect(this);
		if (off || !effectsEnabled || !focusEnabled) unloadFocusEffect(this);
		if (off || !effectsEnabled || !typewriterEnabled) unloadTypewriterEffect();
		const signature = RERENDER_KEYS.map((key) => String(this.inkstoneSettings[key])).join('|');
		if (forceRerender || (this.lastScopeSignature !== null && this.lastScopeSignature !== signature)) {
			this.rerenderReadingViews();
		}
		this.lastScopeSignature = signature;
	}

	/** 去抖落盘：连续变更合并为停顿后一次 data.json 写入。 */
	private scheduleSaveSettings(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void saveSettings(this);
		}, SAVE_DEBOUNCE_MS);
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
