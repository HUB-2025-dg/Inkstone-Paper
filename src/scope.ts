import { Plugin } from 'obsidian';
import type { InkstoneSettings } from './settings';
import { applyMapping } from './mapping';

/**
 * 生效范围管理（PLAN §5）。
 * 规则：全局开关（设置）+ frontmatter 覆盖（`inkstone: false` 单篇关闭，
 * `inkstone: true` 可在全局关闭时单篇开启；`inkstone-paper: true` 切白纸打印变体）。
 * 作用域类挂在渲染根容器上：`inkstone` / `inkstone-off` / `inkstone-paper`，
 * 动效与排版样式只在 `.inkstone` 作用域内生效。
 */

export const SCOPE_ON = 'inkstone';
export const SCOPE_OFF = 'inkstone-off';
export const SCOPE_PAPER = 'inkstone-paper';
/** body 级全局开关镜像：Live Preview 共享的基础排版以它为前提（无动效）。 */
export const SCOPE_GLOBAL = 'inkstone-global';

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

/** 按全局开关 + frontmatter 覆盖解析应挂的作用域类。 */
export function resolveScopeClasses(frontmatter: unknown, settings: InkstoneSettings): string[] {
	const fm = (frontmatter ?? {}) as Record<string, unknown>;
	const enabled = normalizeBoolean(fm['inkstone']) ?? settings.enabled;
	if (!enabled) return [SCOPE_OFF];
	const classes = [SCOPE_ON];
	if (normalizeBoolean(fm['inkstone-paper']) === true) classes.push(SCOPE_PAPER);
	return classes;
}

/** 在容器上幂等地挂/摘三类作用域标记。 */
function applyScopeClasses(rootEl: Element, frontmatter: unknown, settings: InkstoneSettings): void {
	const classes = resolveScopeClasses(frontmatter, settings);
	rootEl.classList.toggle(SCOPE_ON, classes.includes(SCOPE_ON));
	rootEl.classList.toggle(SCOPE_OFF, classes.includes(SCOPE_OFF));
	rootEl.classList.toggle(SCOPE_PAPER, classes.includes(SCOPE_PAPER));
}

/** 全局开关镜像到 body：控制 Live Preview 共享层与卸载清理。 */
export function applyGlobalScope(settings: InkstoneSettings): void {
	document.body.classList.toggle(SCOPE_GLOBAL, settings.enabled);
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
