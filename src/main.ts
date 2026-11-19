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
	applyTypographyOverrides,
	clearBodyOverrides,
	clearScopeClasses,
	registerScopePostProcessor,
	syncScopeClasses,
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

/** 作用域同步去抖窗口（ms）：layout-change / active-leaf-change 在切标签、
 *  分屏、开合侧栏时会成串触发，合并为停顿后一次重算（PLAN §14 改动项 B）。 */
const SCOPE_SYNC_DEBOUNCE_MS = 100;

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
	/** 去抖作用域同步计时器句柄。 */
	private scopeSyncTimer: number | null = null;
	/** 卸载标记：`onLayoutReady` 回调无法注销，用它短路卸载后才到达的回调。 */
	private disposed = false;

	override async onload(): Promise<void> {
		await loadSettings(this);
		// 先注册渲染管线与动效层（PLAN §8）：refreshRuntime 的首轮重渲染必须
		// 发生在 post-processor 注册之后，否则那次渲染用不上本插件的处理器
		registerScopePostProcessor(this);
		registerRevealEffect(this);
		registerFocusEffect(this);
		registerTypewriterCommand(this);
		// 设置面板（PLAN §10 步骤 6）
		this.addSettingTab(new InkstoneSettingTab(this.app, this));
		// 去抖计时器随插件卸载取消（registerEvent 只管事件，setTimeout 需显式登记）
		this.register(() => this.cancelScopeSync());
		// 布局恢复完成后再同步一次：onload 时工作区常为空，已还原的标签页在此补类；
		// onLayoutReady 无注销句柄，用 disposed 短路（PLAN §14 B）
		this.app.workspace.onLayoutReady(() => {
			if (!this.disposed) this.scheduleScopeSync();
		});
		// 主题切换等 CSS 变更会改变暗色门控的判定：重算作用域并重渲染阅读视图
		this.registerEvent(this.app.workspace.on('css-change', () => this.refreshRuntime(true)));
		// 弹窗窗口有独立 body/document（复审第 1 轮 §5）：新弹窗打开与布局变化时
		// 重铺排版覆盖并同步作用域；作用域签名未变化，不会触发阅读视图重渲染
		this.registerEvent(this.app.workspace.on('window-open', () => this.refreshRuntime()));
		// 切标签 / 分屏 / 布局变化：视图与文件绑定改变或阅读根重建，去抖后重同步
		this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleScopeSync()));
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.scheduleScopeSync()),
		);
		// 非激活方式打开文件（unpinned leaf、后台打开）不经过 active-leaf-change：
		// file-open 兜住「文件已绑定但作用域类未同步」的路径
		this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleScopeSync()));
		// frontmatter 编辑后的元数据变更（分屏/编辑模式改 inkstone: false|true）：
		// 不依赖文件重新打开，缓存一更新就重算阅读根与 LP 作用域类
		this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleScopeSync()));
		// 立即重算一次：排版覆盖 + 阅读域/LP 作用域同步（含首轮重渲染）
		this.refreshRuntime();
	}

	override onunload(): void {
		// 先停同步：避免卸载清理后残留的去抖回调把作用域类重新挂回去
		this.disposed = true;
		this.cancelScopeSync();
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
	 * 重算 body 级排版覆盖（主窗口 + 弹窗逐窗口执行）：字体/缩放/栏宽经
	 * CSS 变量与类即时生效，无需重渲染；关停中的动效立即清理观察器与残留类。
	 * 随后按 frontmatter 幂等同步每个阅读视图与 Live Preview 源容器的作用域类
	 * ——这一步与渲染时机无关，是「已渲染但漏挂」路径的权威修正（PLAN §14 B）。
	 * 仅当作用域签名（RERENDER_KEYS）相对上次变化时重渲染打开的阅读视图，
	 * 使纸张/暗色门控与观察器附着按最新设置重新解析；forceRerender 跳过签名
	 * 比对（css-change 等环境性变更）。首轮（lastScopeSignature 为 null）不再
	 * 跳过：签名比对自然为「已变化」，打开的阅读视图各重渲染一次，让动效
	 * 观察器在插件重新启用时立即附着；冷启动时布局尚未恢复、无 markdown 叶子，
	 * 这次重渲染是空操作，真正补类由 onLayoutReady 的同步完成。切标签与
	 * 布局变化不会重渲染（签名未变），避免重复开销。
	 */
	private refreshRuntime(forceRerender = false): void {
		applyTypographyOverrides(this);
		syncScopeClasses(this);
		const off = !this.inkstoneSettings.enabled;
		const { effectsEnabled, revealEnabled, focusEnabled, typewriterEnabled } = this.inkstoneSettings;
		if (off || !effectsEnabled || !revealEnabled) unloadRevealEffect(this);
		if (off || !effectsEnabled || !focusEnabled) unloadFocusEffect(this);
		if (off || !effectsEnabled || !typewriterEnabled) unloadTypewriterEffect();
		const signature = RERENDER_KEYS.map((key) => String(this.inkstoneSettings[key])).join('|');
		if (forceRerender || this.lastScopeSignature !== signature) {
			this.rerenderReadingViews();
		}
		this.lastScopeSignature = signature;
	}

	/** 去抖作用域重算：合并 layout-change / active-leaf-change 的成串触发。 */
	private scheduleScopeSync(): void {
		if (this.disposed) return;
		if (this.scopeSyncTimer !== null) window.clearTimeout(this.scopeSyncTimer);
		this.scopeSyncTimer = window.setTimeout(() => {
			this.scopeSyncTimer = null;
			if (this.disposed) return;
			this.refreshRuntime();
		}, SCOPE_SYNC_DEBOUNCE_MS);
	}

	/** 取消待执行的同步（卸载与重新登记时调用）。 */
	private cancelScopeSync(): void {
		if (this.scopeSyncTimer !== null) {
			window.clearTimeout(this.scopeSyncTimer);
			this.scopeSyncTimer = null;
		}
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
