import { Plugin } from 'obsidian';

/**
 * Inkstone 设置（最小集）。
 * PLAN §9 的完整设置项（纸张样式、字体、字号、栏宽、动效开关等）由后续步骤扩展，
 * 本文件当前只承载「全局开关」，供作用域层判定生效范围。
 */
export interface InkstoneSettings {
	/** 全局总开关：关闭时插件不做任何排版干预（frontmatter `inkstone: true` 仍可单篇开启）。 */
	enabled: boolean;
}

export const DEFAULT_SETTINGS: InkstoneSettings = {
	enabled: true,
};

/** settings.ts 与其他模块之间避免循环 import 的最小宿主形状。
 *  属性名避开 Plugin 基类（Obsidian v1.13+ 自带 settings 成员），故用 inkstoneSettings。 */
export interface SettingsHost extends Plugin {
	inkstoneSettings: InkstoneSettings;
}

export async function loadSettings(plugin: SettingsHost): Promise<void> {
	const stored = (await plugin.loadData()) as Partial<InkstoneSettings> | null;
	plugin.inkstoneSettings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
}

export async function saveSettings(plugin: SettingsHost): Promise<void> {
	await plugin.saveData(plugin.inkstoneSettings);
}
