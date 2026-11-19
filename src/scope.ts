import { MarkdownView, Plugin } from 'obsidian';
import type { InkstoneSettings } from './settings';
import { applyMapping } from './mapping';

/**
 * 生效范围管理（PLAN §5、§9）。
 * 规则：全局开关（设置）+ 暗色门控（设置）+ frontmatter 覆盖：
 * - `inkstone: false` 单篇关闭；`inkstone: true` 可在全局关闭时单篇开启；
 * - `inkstone-paper: true/false` 单篇双向覆盖纸张样式（全局默认来自设置）。
 * 作用域类挂在渲染根容器上：`inkstone` / `inkstone-off` / `inkstone-paper`，
 * 动效与排版样式只在 `.inkstone` 作用域内生效。
 * body 级：全局开关镜像 `inkstone-global`（Live Preview 共享层前提）、
 * 排版覆盖类与 CSS 自定义属性（字号缩放、栏宽），由 applyTypographyOverrides 维护；
 * 主窗口与全部弹窗逐窗口执行（弹窗有独立 body/document，复审第 1 轮 §5）。
 */

export const SCOPE_ON = 'inkstone';
export const SCOPE_OFF = 'inkstone-off';
export const SCOPE_PAPER = 'inkstone-paper';
/** body 级全局开关镜像：Live Preview 共享的基础排版以它为前提（无动效）。 */
export const SCOPE_GLOBAL = 'inkstone-global';

/** 字体族覆盖（settings.fontOverride → body 类，styles.css ⑦ 改写生效字体令牌）。 */
export const FONT_SANS_CLASS = 'inkstone-font-sans';
export const FONT_OBSIDIAN_CLASS = 'inkstone-font-obsidian';
/** 交互呼吸关闭（效果总开关或呼吸开关任一关闭）→ body 类，CSS 摘除 hover 过渡。 */
export const BREATH_OFF_CLASS = 'inkstone-breath-off';

/** 阅读视图渲染根（post-processor 的 el 是逐块传入的，需向上定位容器）。
 *  动效层（src/effects/）同样用它定位渲染根，故导出共用。
 *  `.markdown-reading-view` 是 MarkdownView 构造即存在的稳定容器（Obsidian
 *  1.15.0 的实际 DOM 链：`.markdown-reading-view > .markdown-preview-view…`，
 *  PLAN §14 诊断结论），同步逻辑以它为兜底锚点：内容尚未渲染时类已在位，
 *  渲染完成即生效；`.markdown-reading-view-content` 在 obsidian.asar 中
 *  0 次出现，保留只为兼容极旧版本，匹配不到无副作用。 */
export const RENDER_ROOT_SELECTOR =
	'.markdown-reading-view-content, .markdown-preview-view, .markdown-reading-view';

/** 嵌入块（transclusion）容器：其内的渲染根归属被嵌入文件，不得按外层
 *  笔记的 frontmatter 改写（PLAN §2 决策 3「单篇覆盖」只作用于自身文件）。 */
const EMBED_SELECTOR = '.internal-embed';

export type ScopeHost = Plugin & { inkstoneSettings: InkstoneSettings };

function normalizeBoolean(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const lowered = value.trim().toLowerCase();
		if (lowered === 'true') return true;
		if (lowered === 'false') return false;
	}
	return undefined;
}

/** 当前应用是否为暗色主题（body.theme-dark，Obsidian 官方主题标记）。 */
export function isDarkTheme(): boolean {
	return document.body.classList.contains('theme-dark');
}

/** 系统减少动态偏好（PLAN §8：全部动效尊重；动效模块共用本函数）。 */
export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 收集全部已打开窗口的 document（主窗口 + 弹窗）。
 *  弹窗有独立 body/document（复审第 1 轮 §5）：body 级镜像与卸载清理必须
 *  逐窗口执行。窗口→文档无公开清单，经叶子视图反查归属文档。 */
export function collectDocuments(plugin: ScopeHost): Document[] {
	const docs = new Set<Document>([document]);
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const doc = leaf.view.containerEl?.ownerDocument;
		if (doc) docs.add(doc);
	});
	return Array.from(docs);
}

/**
 * 按全局开关、暗色门控 + frontmatter 覆盖解析应挂的作用域类。
 * 读取路径：ctx.frontmatter 的 `inkstone` 布尔（含 'true'/'false' 字符串归一化）
 * 优先于全局开关——`inkstone: false` 单篇关闭（压过一切）；`inkstone: true`
 * 单篇开启（压过全局开关与暗色门控）。暗色门控（darkModeEnabled）只约束
 * 未在 frontmatter 显式表达的笔记：它是用户对应用的偏好，不推翻单篇显式表达。
 * isDark 由调用方注入（测试可传固定值），缺省取当前主题。
 */
export function resolveScopeClasses(
	frontmatter: unknown,
	settings: InkstoneSettings,
	isDark: boolean = isDarkTheme(),
): string[] {
	const fm = (frontmatter ?? {}) as Record<string, unknown>;
	const fmEnabled = normalizeBoolean(fm['inkstone']);
	if (fmEnabled === false) return [SCOPE_OFF];
	const enabled = fmEnabled ?? settings.enabled;
	if (!enabled) return [SCOPE_OFF];
	if (fmEnabled === undefined && !settings.darkModeEnabled && isDark) return [SCOPE_OFF];
	const classes = [SCOPE_ON];
	const paperWhite = normalizeBoolean(fm['inkstone-paper']) ?? settings.paperStyle === 'white';
	if (paperWhite) classes.push(SCOPE_PAPER);
	return classes;
}

/** 在容器上幂等地挂/摘三类作用域标记。
 *  `isDark` 由调用方注入：一次同步内的全部根共用同一次主题读取。 */
function applyScopeClasses(
	rootEl: Element,
	frontmatter: unknown,
	settings: InkstoneSettings,
	isDark: boolean = isDarkTheme(),
): void {
	const classes = resolveScopeClasses(frontmatter, settings, isDark);
	rootEl.classList.toggle(SCOPE_ON, classes.includes(SCOPE_ON));
	rootEl.classList.toggle(SCOPE_OFF, classes.includes(SCOPE_OFF));
	rootEl.classList.toggle(SCOPE_PAPER, classes.includes(SCOPE_PAPER));
}

/** 单个笔记视图内的渲染根（逐叶子收集，不做全文档盲扫——盲扫会把 hover
 *  预览与嵌入块的 `.markdown-preview-view` 一并改写）。
 *  `.markdown-reading-view` 与 `.markdown-preview-view` 成对挂同一份类：
 *  styles.css ② 对两种挂法都做了钉死（`.inkstone .markdown-preview-view` 与
 *  `.markdown-preview-view.inkstone`），层级冗余不影响样式结果。
 *  嵌入块内的根过滤掉：它们由 post-processor 按 ctx.frontmatter 自行处理。 */
function collectReadingRoots(container: HTMLElement): HTMLElement[] {
	const candidates = Array.from(
		container.querySelectorAll<HTMLElement>(RENDER_ROOT_SELECTOR),
	);
	return candidates.filter((rootEl) => rootEl.closest(EMBED_SELECTOR) === null);
}

/**
 * 按 metadataCache 的 frontmatter 把作用域类直挂到每个打开笔记的阅读视图
 * （PLAN §14 改动项 B）。post-processor 依赖渲染调用时刻的 DOM 归属，而
 * Obsidian 1.15.0 的 section 在 postProcessor 运行时尚未上树（诊断结论），
 * 因此渲染路径本身不可靠；本函数改从视图 + frontmatter 缓存这一权威来源
 * 幂等同步：
 * - 遍历全部窗口（主窗口 / 分屏 / 多标签 / 弹窗）的所有 markdown 叶子，
 *   编辑模式同样同步——`.markdown-reading-view` 常驻，切回阅读模式无需
 *   等一次渲染；
 * - 解析结果与 post-processor 完全同源（resolveScopeClasses），
 *   `inkstone: false` 同步后为 `inkstone-off`；
 * - `applyScopeClasses` 用 `classList.toggle(…, force)` 双向纠正，重复同步
 *   不叠加类、不摘除应有类（幂等）。
 * 未索引的新文件没有 frontmatter 缓存，按全局设置解析（与无 frontmatter
 * 的笔记一致）；索引完成后下一次同步自然收敛。
 */
export function syncScopeClasses(plugin: ScopeHost): void {
	const settings = plugin.inkstoneSettings;
	const isDark = isDarkTheme();
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		// MarkdownView 非 DOM Node，用 instanceof（同 main.ts 的重渲染路径）
		if (!(view instanceof MarkdownView)) return;
		const frontmatter = view.file
			? plugin.app.metadataCache.getFileCache(view.file)?.frontmatter
			: undefined;
		for (const rootEl of collectReadingRoots(view.contentEl)) {
			applyScopeClasses(rootEl, frontmatter, settings, isDark);
		}
	});
}

/** 全局开关（含暗色门控）镜像到各窗口 body：控制 Live Preview 共享层与卸载清理。 */
export function applyGlobalScope(plugin: ScopeHost): void {
	const settings = plugin.inkstoneSettings;
	const active = settings.enabled && (!isDarkTheme() || settings.darkModeEnabled);
	for (const doc of collectDocuments(plugin)) {
		doc.body.classList.toggle(SCOPE_GLOBAL, active);
	}
}

/**
 * 设置驱动的 body 级排版覆盖（settings.ts 设置变更即调，即时生效）：
 * - 字体族覆盖走 body 类（离散值）；
 * - 字号缩放与栏宽走 CSS 自定义属性（连续值）。审核规范明确允许经
 *   `style.setProperty` 传自定义属性——这是代码向 CSS 类传值的正规通道；
 * 排版层与 Live Preview 共享层一律经 `--ik-font` / `--ik-scale-*` /
 * `--ik-measure` 取值（styles.css ①）。
 */
export function applyTypographyOverrides(plugin: ScopeHost): void {
	const { fontOverride, effectsEnabled, breathEnabled, fontScale, lineWidth } =
		plugin.inkstoneSettings;
	for (const doc of collectDocuments(plugin)) {
		const body = doc.body;
		body.classList.toggle(FONT_SANS_CLASS, fontOverride === 'sans');
		body.classList.toggle(FONT_OBSIDIAN_CLASS, fontOverride === 'obsidian');
		body.classList.toggle(BREATH_OFF_CLASS, !(effectsEnabled && breathEnabled));
		body.style.setProperty('--ik-scale', String(fontScale / 100));
		body.style.setProperty('--ik-measure', `${Math.round(lineWidth)}px`);
	}
}

/**
 * 注册 post-processor：读 ctx.frontmatter → 挂/摘作用域类；
 * 仅在生效域内执行排版映射。同步回调，不引入异步渲染路径。
 * 时序注意：Obsidian 1.15.0 的 section 在 postProcessor 回调时可能尚未
 * 上树（PLAN §14 诊断结论），此时 `el.closest` 找不到渲染根，本回调会
 * 静默返回；作用域类的最终归属由 syncScopeClasses（视图 + metadataCache
 * 驱动）兜底层保证，两者解析逻辑同源、结果一致。
 * 守卫（复审第 1 轮 §2/§3）：
 * - Live Preview：编辑器域内渲染（含 cm widget 与编辑器内嵌入块）一律不挂
 *   作用域类——排版令牌经 body 级镜像已生效，动效不进入 LP（PLAN 决策 8 /
 *   ADR-0003）；
 * - 嵌入内容归属：el 若位于外层笔记的嵌入块（transclusion）内，本次 ctx
 *   属于被嵌入文件，不得改写外层渲染根的作用域（PLAN §2 决策 3「单篇覆盖」
 *   只作用于自身文件）；被嵌入文件自带渲染根时则正常挂类（根与 frontmatter
 *   同源）；
 * - 无阅读渲染根的宿主（异常容器）不挂类：宁可漏挂，不可错挂到外层容器
 *   （原 `?? el` 回退会把类挂到 widget 上，已移除）。
 */
export function registerScopePostProcessor(plugin: ScopeHost): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		// Live Preview / 编辑器域内渲染的一切（含嵌入 widget）不参与作用域
		if (el.closest('.cm-editor')) return;
		const rootEl = el.closest(RENDER_ROOT_SELECTOR);
		if (!rootEl) return;
		const embedEl = el.closest(EMBED_SELECTOR);
		if (embedEl !== null && rootEl.contains(embedEl)) {
			// el 在外层笔记的嵌入块内：ctx 的 frontmatter 归属被嵌入文件，跳过
			// 作用域改写；排版映射跟随外层根继续执行（嵌入内容随外层页样式渲染）
			if (rootEl.classList.contains(SCOPE_ON)) applyMapping(el);
			return;
		}
		applyScopeClasses(rootEl, ctx.frontmatter, plugin.inkstoneSettings);
		if (rootEl.classList.contains(SCOPE_ON)) {
			applyMapping(el);
		}
	});
}

/** 摘除全部作用域类（插件卸载 / 关闭时恢复 Obsidian 原状，零残留；逐窗口）。
 *  按类名反查而非按渲染根选择器枚举：`.markdown-reading-view` /
 *  `.markdown-preview-view` / 任何曾承载作用域类的容器都被覆盖，
 *  选择器扩容不需要在这里追加分支。 */
export function clearScopeClasses(plugin: ScopeHost): void {
	const selector = [
		`.${SCOPE_ON}`,
		`.${SCOPE_OFF}`,
		`.${SCOPE_PAPER}`,
		`.${SCOPE_GLOBAL}`,
	].join(', ');
	for (const doc of collectDocuments(plugin)) {
		for (const node of Array.from(doc.querySelectorAll(selector))) {
			node.classList.remove(SCOPE_ON, SCOPE_OFF, SCOPE_PAPER, SCOPE_GLOBAL);
		}
	}
}

/** 摘除 body 级排版覆盖类与自定义属性（卸载清理，零残留；逐窗口）。 */
export function clearBodyOverrides(plugin: ScopeHost): void {
	for (const doc of collectDocuments(plugin)) {
		const body = doc.body;
		body.classList.remove(FONT_SANS_CLASS, FONT_OBSIDIAN_CLASS, BREATH_OFF_CLASS);
		body.style.removeProperty('--ik-scale');
		body.style.removeProperty('--ik-measure');
	}
}
