import { Plugin } from 'obsidian';

/**
 * Inkstone 设置。
 * 当前承载：全局开关 + 动效项（滚动渐显开关、聚焦阅读开关、打字机速度）。
 * PLAN §9 其余项（纸张样式、字体族、字号缩放、栏宽）由设置面板步骤补齐。
 */
export interface InkstoneSettings {
	/** 全局总开关：关闭时插件不做任何排版干预（frontmatter `inkstone: true` 仍可单篇开启）。 */
	enabled: boolean;
	/** 滚动渐显：块级淡入 + 8px 上浮，进入视口触发一次（仅阅读域，PLAN §8.1）。 */
	revealEnabled: boolean;
	/** 聚焦阅读：视口中带之外的段落退灰（仅阅读域，PLAN §8.3）。默认关：它改变常态阅读外观，属显式选择的阅读状态。 */
	focusEnabled: boolean;
	/** 打字机速度：字/秒，读入时夹取至 [TYPEWRITER_SPEED_MIN, TYPEWRITER_SPEED_MAX]（PLAN §8.4）。 */
	typewriterSpeed: number;
}

/** 打字机速度范围（PLAN §8.4：10-120 字/秒，默认 45）。 */
export const TYPEWRITER_SPEED_MIN = 10;
export const TYPEWRITER_SPEED_MAX = 120;
export const TYPEWRITER_SPEED_DEFAULT = 45;

export const DEFAULT_SETTINGS: InkstoneSettings = {
	enabled: true,
	revealEnabled: true,
	focusEnabled: false,
	typewriterSpeed: TYPEWRITER_SPEED_DEFAULT,
};

/** 夹取打字机速度到合法区间；非法输入（缺省/非数）回退默认值。 */
export function clampTypewriterSpeed(value: unknown): number {
	const speed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(speed)) return TYPEWRITER_SPEED_DEFAULT;
	return Math.min(TYPEWRITER_SPEED_MAX, Math.max(TYPEWRITER_SPEED_MIN, Math.round(speed)));
}

/** settings.ts 与其他模块之间避免循环 import 的最小宿主形状。
 *  属性名避开 Plugin 基类（Obsidian v1.13+ 自带 settings 成员），故用 inkstoneSettings。 */
export interface SettingsHost extends Plugin {
	inkstoneSettings: InkstoneSettings;
}

export async function loadSettings(plugin: SettingsHost): Promise<void> {
	const stored = (await plugin.loadData()) as Partial<InkstoneSettings> | null;
	const merged = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	plugin.inkstoneSettings = {
		...merged,
		typewriterSpeed: clampTypewriterSpeed(merged.typewriterSpeed),
	};
}

export async function saveSettings(plugin: SettingsHost): Promise<void> {
	await plugin.saveData(plugin.inkstoneSettings);
}
