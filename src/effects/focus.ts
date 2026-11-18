import {
	RENDER_ROOT_SELECTOR,
	SCOPE_ON,
	collectDocuments,
	prefersReducedMotion,
	type ScopeHost,
} from '../scope';

/**
 * 聚焦阅读（PLAN §8.3）：视口中带之外的段落退灰至 stone 档，带内保持墨色。
 * 用 IntersectionObserver 的视口中带（rootMargin 上下各收 30%）判定：段落跨过
 * 带边界时回调，带外挂 dim 类、带内摘除，滚动全程状态自洽。根级挂
 * `.inkstone-focus` 提供过渡底座（只在阅读域 `.inkstone` 内生效）。
 * 受效果总开关 + focusEnabled 独立开关门控；reduced-motion 时不挂观察器（保持静态排版）。
 * Live Preview 域内渲染不参与（复审第 1 轮 §3）；卸载清理逐窗口执行（复审第 1 轮 §5）。
 */

const FOCUS_SCOPE_CLASS = 'inkstone-focus';
const FOCUS_DIM_CLASS = 'inkstone-focus-dim';
/** 视口中带：上下各收 30%，中段 40% 为「正在阅读」区域 */
const FOCUS_BAND_MARGIN = '-30% 0px -30% 0px';

/** 渲染根 → 该根的观察器；卸载/视图关闭时 disconnect。 */
const observers = new Map<HTMLElement, IntersectionObserver>();
/** 渲染根 → 已观察段落集合（post-processor 重复回调时幂等） */
const observed = new Map<HTMLElement, Set<HTMLElement>>();

function onFocusEntries(entries: IntersectionObserverEntry[]): void {
	for (const entry of entries) {
		const paragraph = entry.target as HTMLElement;
		if (!paragraph.isConnected) continue;
		paragraph.classList.toggle(FOCUS_DIM_CLASS, !entry.isIntersecting);
	}
}

/** 视图关闭后其渲染根脱离文档：断开对应观察器，清空已观察集合。 */
function pruneDetachedRoots(): void {
	for (const [rootEl, observer] of observers) {
		if (!rootEl.isConnected) {
			observer.disconnect();
			observers.delete(rootEl);
			observed.delete(rootEl);
		}
	}
}

export function registerFocusEffect(plugin: ScopeHost): void {
	plugin.registerMarkdownPostProcessor((el) => {
		// Live Preview 域内渲染不参与（ADR-0003：LP 无动效；复审第 1 轮 §3）
		if (el.closest('.cm-editor')) return;
		// 只认真实阅读渲染根：不回退到 el 本身（LP widget 等无根宿主不参与）
		const rootEl = el.closest(RENDER_ROOT_SELECTOR);
		if (!rootEl?.instanceOf(HTMLElement)) return;
		if (!rootEl.classList.contains(SCOPE_ON)) return;
		const { effectsEnabled, focusEnabled } = plugin.inkstoneSettings;
		if (!effectsEnabled || !focusEnabled) return;
		if (prefersReducedMotion()) return;

		let observer = observers.get(rootEl);
		let seen = observed.get(rootEl);
		if (!observer || !seen) {
			observer = new IntersectionObserver(onFocusEntries, {
				rootMargin: FOCUS_BAND_MARGIN,
			});
			observers.set(rootEl, observer);
			seen = new Set();
			observed.set(rootEl, seen);
		}
		rootEl.classList.add(FOCUS_SCOPE_CLASS);

		for (const paragraph of Array.from(el.querySelectorAll('p'))) {
			if (!paragraph.instanceOf(HTMLElement) || seen.has(paragraph)) continue;
			seen.add(paragraph);
			observer.observe(paragraph);
		}
	});

	plugin.registerEvent(plugin.app.workspace.on('layout-change', pruneDetachedRoots));
}

/** 插件卸载：断开全部观察器，逐窗口摘除根级标记与 dim 类。 */
export function unloadFocusEffect(plugin: ScopeHost): void {
	for (const observer of observers.values()) observer.disconnect();
	observers.clear();
	observed.clear();
	// 弹窗窗口有独立 document（复审第 1 轮 §5）：逐窗口清理
	for (const doc of collectDocuments(plugin)) {
		const nodes = doc.querySelectorAll(`.${FOCUS_SCOPE_CLASS}, .${FOCUS_DIM_CLASS}`);
		for (const node of Array.from(nodes)) {
			node.classList.remove(FOCUS_SCOPE_CLASS, FOCUS_DIM_CLASS);
		}
	}
}
