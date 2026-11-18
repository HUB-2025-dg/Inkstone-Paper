import { MarkdownView } from 'obsidian';
import { SCOPE_ON, prefersReducedMotion, type ScopeHost } from '../scope';

/**
 * 打字机（PLAN §8.4）：命令触发，逐字显现当前阅读视图内容。
 * 实现：把可见文本节点逐字包进透明 span（布局不变），按设置速度（字/秒）
 * 以 requestAnimationFrame 依序摘除 hide 类显形；点击或 Esc 跳过。
 * 结束/跳过/卸载时解包恢复原文本节点（零残留）。
 * 受效果总开关 + typewriterEnabled 独立开关门控，关闭时命令不可用；
 * reduced-motion 时不启动（退化静态，命令在命令面板中亦不可见）。
 */

const TW_HIDE_CLASS = 'inkstone-tw-hide';
/** 不参与逐字显现的容器 */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
/** HTML 命名空间：逐字 span 只能活在 HTML 里。SVG（mermaid 内联）与 MathML
 *  （KaTeX 的 MathML 分支）是外来命名空间，HTML span 在其中不渲染——播放期间
 *  跳过其文本节点，避免图内文字消失（复审第 1 轮 §6）。 */
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

interface TypewriterRecord {
	/** 该文本节点对应的逐字 span（文档序） */
	spans: HTMLSpanElement[];
	/** 原文本（结束时整体恢复） */
	text: string;
}

interface TypewriterSession {
	root: HTMLElement;
	/** 视图所属文档（弹窗窗口的 Esc 也能收到） */
	doc: Document;
	records: TypewriterRecord[];
	/** 全部 span 依文档序展平（显形进度按此推进） */
	spans: HTMLSpanElement[];
	revealed: number;
	frame: number;
	onRootClick: () => void;
}

let session: TypewriterSession | null = null;

/** 当前阅读视图的渲染根（仅阅读模式；编辑/Live Preview 不参与，ADR-0003）。 */
function findReadingRoot(plugin: ScopeHost): HTMLElement | null {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || view.getMode() !== 'preview') return null;
	return (
		view.contentEl.querySelector<HTMLElement>('.markdown-reading-view-content') ??
		view.contentEl.querySelector<HTMLElement>('.markdown-preview-view')
	);
}

/** 文本节点 → 逐字透明 span。纯空白节点原样保留：它们不可见，且 pre 内缩进依赖空白。 */
function wrapTextNodes(root: HTMLElement): TypewriterRecord[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const records: TypewriterRecord[] = [];
	let node = walker.nextNode();
	while (node) {
		const textNode = node as Text;
		node = walker.nextNode();
		const parent = textNode.parentElement;
		if (
			!parent ||
			SKIP_TAGS.has(parent.tagName) ||
			parent.namespaceURI !== XHTML_NS ||
			parent.isContentEditable
		)
			continue;
		const text = textNode.nodeValue ?? '';
		if (text.trim().length === 0) continue;

		const fragment = createFragment();
		const spans: HTMLSpanElement[] = [];
		for (const character of text) {
			const span = createSpan({ cls: TW_HIDE_CLASS, text: character });
			fragment.appendChild(span);
			spans.push(span);
		}
		textNode.replaceWith(fragment);
		records.push({ spans, text });
	}
	return records;
}

function startSession(root: HTMLElement, speed: number): void {
	const records = wrapTextNodes(root);
	const spans = records.flatMap((record) => record.spans);
	if (spans.length === 0) return;

	const active: TypewriterSession = {
		root,
		doc: root.doc,
		records,
		spans,
		revealed: 0,
		frame: 0,
		onRootClick: () => skipSession(),
	};
	session = active;
	root.addEventListener('click', active.onRootClick);
	active.doc.addEventListener('keydown', onSessionKeydown);

	const startedAt = performance.now();
	const charactersPerMs = speed / 1000;
	const tick = (now: number): void => {
		if (session !== active) return; // 已被跳过/结束/卸载
		if (!active.root.isConnected) {
			// 阅读视图已关闭：直接恢复并收尾
			endSession();
			return;
		}
		const due = Math.min(active.spans.length, Math.floor((now - startedAt) * charactersPerMs));
		while (active.revealed < due) {
			active.spans[active.revealed]?.classList.remove(TW_HIDE_CLASS);
			active.revealed += 1;
		}
		if (active.revealed >= active.spans.length) {
			endSession();
			return;
		}
		active.frame = window.requestAnimationFrame(tick);
	};
	active.frame = window.requestAnimationFrame(tick);
}

function onSessionKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') skipSession();
}

/** 跳过：剩余字符立即显形，然后收尾恢复 DOM。 */
function skipSession(): void {
	if (!session) return;
	for (const span of session.spans) span.classList.remove(TW_HIDE_CLASS);
	endSession();
}

/** 收尾：解包全部逐字 span，恢复原文本节点（零残留）。 */
function endSession(): void {
	const active = session;
	if (!active) return;
	session = null;
	window.cancelAnimationFrame(active.frame);
	active.root.removeEventListener('click', active.onRootClick);
	active.doc.removeEventListener('keydown', onSessionKeydown);
	for (const record of active.records) {
		const [first] = record.spans;
		if (!first?.parentElement) continue;
		first.parentElement.insertBefore(document.createTextNode(record.text), first);
		for (const span of record.spans) span.remove();
	}
}

export function registerTypewriterCommand(plugin: ScopeHost): void {
	plugin.addCommand({
		id: 'play-typewriter-effect',
		name: 'Play typewriter effect',
		checkCallback: (checking: boolean) => {
			// 播放中不重复触发；效果总开关/独立开关关闭或 reduced-motion 时命令不可见
			if (session || prefersReducedMotion()) return false;
			const { effectsEnabled, typewriterEnabled, typewriterSpeed } = plugin.inkstoneSettings;
			if (!effectsEnabled || !typewriterEnabled) return false;
			const root = findReadingRoot(plugin);
			if (!root || !root.classList.contains(SCOPE_ON)) return false;
			if (checking) return true;
			startSession(root, typewriterSpeed);
			return true;
		},
	});
}

/** 插件卸载：若仍在播放，立即解包恢复 DOM。 */
export function unloadTypewriterEffect(): void {
	endSession();
}
