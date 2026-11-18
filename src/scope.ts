import { Plugin } from 'obsidian';
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
 * 排版覆盖类与 CSS 自定义属性（字号缩放、栏宽），由 applyTypographyOverrides 维护。
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
 *  动效层（src/effects/）同样用它定位渲染根，故导出共用。 */
export const RENDER_ROOT_SELECTOR = '.markdown-reading-view-content, .markdown-preview-view';

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

/** 在容器上幂等地挂/摘三类作用域标记。 */
function applyScopeClasses(rootEl: Element, frontmatter: unknown, settings: InkstoneSettings): void {
	const classes = resolveScopeClasses(frontmatter, settings);
	rootEl.classList.toggle(SCOPE_ON, classes.includes(SCOPE_ON));
	rootEl.classList.toggle(SCOPE_OFF, classes.includes(SCOPE_OFF));
	rootEl.classList.toggle(SCOPE_PAPER, classes.includes(SCOPE_PAPER));
}

/** 全局开关（含暗色门控）镜像到 body：控制 Live Preview 共享层与卸载清理。 */
export function applyGlobalScope(settings: InkstoneSettings): void {
	const active = settings.enabled && (!isDarkTheme() || settings.darkModeEnabled);
	document.body.classList.toggle(SCOPE_GLOBAL, active);
}

/**
 * 设置驱动的 body 级排版覆盖（settings.ts 设置变更即调，即时生效）：
 * - 字体族覆盖走 body 类（离散值）；
 * - 字号缩放与栏宽走 CSS 自定义属性（连续值）。审核规范明确允许经
 *   `style.setProperty` 传自定义属性——这是代码向 CSS 类传值的正规通道；
 * 排版层与 Live Preview 共享层一律经 `--ik-font` / `--ik-scale-*` /
 * `--ik-measure` 取值（styles.css ①）。
 */
export function applyTypographyOverrides(settings: InkstoneSettings): void {
	const body = document.body;
	body.classList.toggle(FONT_SANS_CLASS, settings.fontOverride === 'sans');
	body.classList.toggle(FONT_OBSIDIAN_CLASS, settings.fontOverride === 'obsidian');
	body.classList.toggle(BREATH_OFF_CLASS, !(settings.effectsEnabled && settings.breathEnabled));
	body.style.setProperty('--ik-scale', String(settings.fontScale / 100));
	body.style.setProperty('--ik-measure', `${Math.round(settings.lineWidth)}px`);
}

/**
 * 注册 post-processor：读 ctx.frontmatter → 挂/摘作用域类；
 * 仅在生效域内执行排版映射。同步回调，不引入异步渲染路径。
 */
export function registerScopePostProcessor(plugin: ScopeHost): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const rootEl = el.closest(RENDER_ROOT_SELECTOR) ?? el;
		applyScopeClasses(rootEl, ctx.frontmatter, plugin.inkstoneSettings);
		if (rootEl.classList.contains(SCOPE_ON)) {
			applyMapping(el);
		}
	});
}

/** 摘除全部作用域类（插件卸载 / 关闭时恢复 Obsidian 原状，零残留）。 */
export function clearScopeClasses(): void {
	const selector = [
		`.${SCOPE_ON}`,
		`.${SCOPE_OFF}`,
		`.${SCOPE_PAPER}`,
		`.${SCOPE_GLOBAL}`,
	].join(', ');
	for (const node of Array.from(document.querySelectorAll(selector))) {
		node.classList.remove(SCOPE_ON, SCOPE_OFF, SCOPE_PAPER, SCOPE_GLOBAL);
	}
}

/** 摘除 body 级排版覆盖类与自定义属性（卸载清理，零残留）。 */
export function clearBodyOverrides(): void {
	const body = document.body;
	body.classList.remove(FONT_SANS_CLASS, FONT_OBSIDIAN_CLASS, BREATH_OFF_CLASS);
	body.style.removeProperty('--ik-scale');
	body.style.removeProperty('--ik-measure');
}
