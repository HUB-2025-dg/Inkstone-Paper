/**
 * 阅读视图 DOM 结构调整。
 * PLAN §5：排版层 90% 纯 CSS，本模块只做 CSS 够不到的结构调整。
 * 当前唯一条目：img alt → stone 色题注（CSS 无法把属性文本变成节点）。
 */

/** dataset 标记（写入 data-inkstone-caption），保证重复回调时幂等。 */
const CAPTION_FLAG = 'inkstoneCaption';

export function applyMapping(el: HTMLElement): void {
	applyImageCaptions(el);
}

/**
 * 为带非空 alt 的图片在图后插入题注节点。
 * 只插入新元素与 dataset 标记，不搬运 img 本身（避免破坏 Obsidian 的图片交互），
 * 不用任何 HTML 字符串 API；alt 文本经 createSpan 的 text 通道写入，天然免注入。
 */
function applyImageCaptions(el: HTMLElement): void {
	const images = Array.from(el.querySelectorAll('img'));
	for (const img of images) {
		const alt = img.getAttribute('alt');
		const text = alt?.trim();
		if (!text) continue;
		if (img.dataset[CAPTION_FLAG] === 'done') continue;
		if (img.classList.contains('inkstone-captioned')) continue;
		// 题注已存在（先前渲染会话遗留）时跳过
		if (img.nextElementSibling?.classList.contains('inkstone-img-caption')) continue;

		img.classList.add('inkstone-captioned');
		const caption = createSpan({ cls: 'inkstone-img-caption', text });
		img.parentElement?.insertBefore(caption, img.nextSibling);
	}
}
