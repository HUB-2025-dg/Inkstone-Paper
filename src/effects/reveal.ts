import {
	RENDER_ROOT_SELECTOR,
	SCOPE_ON,
	collectDocuments,
	prefersReducedMotion,
	resolveScopeClasses,
	runWhenAttached,
	type ScopeHost,
} from '../scope';

/**
 * 滚动渐显（PLAN §8.1）：IntersectionObserver 驱动的块级淡入 + 8px 上浮，
 * 240ms ease-out，进入视口触发一次（揭示后 unobserve，不回退）。
 * 只在 `.inkstone` 作用域的阅读视图生效；受效果总开关 + 独立开关门控；
 * reduced-motion 时不隐藏任何块（JS 短路不挂观察器，CSS media query 兜底）。
 * 观察器按渲染根登记：插件卸载与视图关闭时断开，类名全部摘除（零残留，
 * 弹窗窗口逐 document 清理，复审第 1 轮 §5）；Live Preview 域内渲染不参与。
 */

const REVEAL_CLASS = 'inkstone-reveal';
const REVEALED_CLASS = 'inkstone-revealed';

/** 渲染根 → 该根的观察器；卸载/视图关闭时 disconnect。 */
const observers = new Map<HTMLElement, IntersectionObserver>();

function onRevealEntries(entries: IntersectionObserverEntry[], observer: IntersectionObserver): void {
	for (const entry of entries) {
		const block = entry.target as HTMLElement;
		if (entry.isIntersecting) {
			// 进入视口：加揭示类触发过渡，之后不再跟踪（触发一次）
			block.classList.add(REVEALED_CLASS);
			observer.unobserve(block);
		} else if (!block.isConnected) {
			// 视图已销毁的块不再跟踪
			observer.unobserve(block);
		}
	}
}

/** 视图关闭后其渲染根脱离文档：断开对应观察器，避免滞留引用。 */
function pruneDetachedRoots(): void {
	for (const [rootEl, observer] of observers) {
		if (!rootEl.isConnected) {
			observer.disconnect();
			observers.delete(rootEl);
		}
	}
}

export function registerRevealEffect(plugin: ScopeHost): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const frontmatter: unknown = ctx.frontmatter;
		// section 在 postProcess 时可能尚未上树（PLAN §14 诊断）：延后到上树后
		// 再定位渲染根，否则 el.closest 永远拿到 null，渐显从不生效
		runWhenAttached(el, (sectionEl) => {
			attachReveal(plugin, sectionEl, frontmatter);
		});
	});

	plugin.registerEvent(plugin.app.workspace.on('layout-change', pruneDetachedRoots));
}

/** 在已上树的 section 上登记渐显块；归属与开关判定均在调用时执行。 */
function attachReveal(plugin: ScopeHost, el: HTMLElement, frontmatter: unknown): void {
	// Live Preview 域内渲染不参与（ADR-0003：LP 无动效；复审第 1 轮 §3）
	if (el.closest('.cm-editor')) return;
	// 只认真实阅读渲染根：不回退到 el 本身（LP widget 等无根宿主不参与）
	const rootEl = el.closest(RENDER_ROOT_SELECTOR);
	if (!rootEl?.instanceOf(HTMLElement)) return;
	const { effectsEnabled, revealEnabled } = plugin.inkstoneSettings;
	if (!effectsEnabled || !revealEnabled) return;
	if (prefersReducedMotion()) return;
	// 按 frontmatter + 设置判定生效域，而非读渲染根类：延后执行时同步可能
	// 尚未挂类；CSS 本身以 `.inkstone` 为前提，类晚到不会产生错误外观
	if (!resolveScopeClasses(frontmatter, plugin.inkstoneSettings).includes(SCOPE_ON)) return;

	let observer = observers.get(rootEl);
	if (!observer) {
		observer = new IntersectionObserver(onRevealEntries, { threshold: 0 });
		observers.set(rootEl, observer);
	}

	// 以渲染块的顶层子元素为单位做块级渐显；空壳容器则取自身
	const blocks = el.children.length > 0 ? Array.from(el.children) : [el];
	for (const block of blocks) {
		if (!block.instanceOf(HTMLElement)) continue;
		// 已登记或已揭示的块跳过（post-processor 可能重复回调，保证幂等）
		if (block.classList.contains(REVEAL_CLASS) || block.classList.contains(REVEALED_CLASS)) {
			continue;
		}
		block.classList.add(REVEAL_CLASS);
		observer.observe(block);
	}
}

/** 插件卸载：断开全部观察器并逐窗口摘除类名，恢复原文档外观。 */
export function unloadRevealEffect(plugin: ScopeHost): void {
	for (const observer of observers.values()) observer.disconnect();
	observers.clear();
	// 弹窗窗口有独立 document（复审第 1 轮 §5）：逐窗口清理
	for (const doc of collectDocuments(plugin)) {
		const nodes = doc.querySelectorAll(`.${REVEAL_CLASS}, .${REVEALED_CLASS}`);
		for (const node of Array.from(nodes)) {
			node.classList.remove(REVEAL_CLASS, REVEALED_CLASS);
		}
	}
}
