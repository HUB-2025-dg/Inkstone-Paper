import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

/**
 * Inkstone 设置（PLAN §9 全量）。
 * 结构：全局开关 / 暗色门控 / 纸张样式 / 字体族覆盖 / 字号缩放 / 栏宽 /
 * 效果总开关 + 四项独立开关（滚动渐显、交互呼吸、聚焦阅读、打字机）/ 打字机速度。
 * frontmatter 覆盖语义见 scope.ts：`inkstone` 与 `inkstone-paper` 均可单篇双向覆盖。
 */

/** 纸张样式：暖纸（Kami 默认）或白纸打印变体。 */
export type PaperStyle = 'warm' | 'white';
/** 字体族覆盖：默认 Kami 衬线栈 / 无衬线栈 / 跟随 Obsidian 外观字体。 */
export type FontOverride = 'default' | 'sans' | 'obsidian';

export interface InkstoneSettings {
	/** 全局总开关：关闭时插件不做任何排版干预（frontmatter `inkstone: true` 仍可单篇开启）。 */
	enabled: boolean;
	/** 暗色下是否生效：关闭后应用处于暗色主题时插件整体不生效（PLAN §9）。 */
	darkModeEnabled: boolean;
	/** 纸张样式：暖纸（Kami 默认）或白纸打印变体（frontmatter `inkstone-paper` 可单篇覆盖）。 */
	paperStyle: PaperStyle;
	/** 字体族覆盖（PLAN §9）。 */
	fontOverride: FontOverride;
	/** 字号缩放：整条字号阶梯的百分比（100 = Kami 默认），读入时夹取至合法区间。 */
	fontScale: number;
	/** 栏宽（px），读入时夹取至合法区间（PLAN §7 默认 700px）。 */
	lineWidth: number;
	/** 效果总开关：关闭时四项动效全部停用。 */
	effectsEnabled: boolean;
	/** 滚动渐显：块级淡入 + 8px 上浮，进入视口触发一次（仅阅读域，PLAN §8.1）。 */
	revealEnabled: boolean;
	/** 交互呼吸：卡片 hover 起伏 + 链接下划线生长（纯 CSS，PLAN §8.2）。 */
	breathEnabled: boolean;
	/** 聚焦阅读：视口中带之外的段落退灰（仅阅读域，PLAN §8.3）。默认关：它改变常态阅读外观，属显式选择的阅读状态。 */
	focusEnabled: boolean;
	/** 打字机动效开关：关闭时命令在命令面板不可用（PLAN §8.4）。 */
	typewriterEnabled: boolean;
	/** 打字机速度：字/秒，读入时夹取至 [TYPEWRITER_SPEED_MIN, TYPEWRITER_SPEED_MAX]（PLAN §8.4）。 */
	typewriterSpeed: number;
}

/** 打字机速度范围（PLAN §8.4：10-120 字/秒，默认 45）。 */
export const TYPEWRITER_SPEED_MIN = 10;
export const TYPEWRITER_SPEED_MAX = 120;
export const TYPEWRITER_SPEED_DEFAULT = 45;

/** 字号缩放范围（百分比，步进 5；100 = Kami 默认阶梯）。 */
export const FONT_SCALE_MIN = 85;
export const FONT_SCALE_MAX = 125;
export const FONT_SCALE_STEP = 5;
export const FONT_SCALE_DEFAULT = 100;

/** 栏宽范围（px，步进 10；Kami 默认 700px）。 */
export const LINE_WIDTH_MIN = 500;
export const LINE_WIDTH_MAX = 1000;
export const LINE_WIDTH_STEP = 10;
export const LINE_WIDTH_DEFAULT = 700;

const PAPER_STYLES: readonly PaperStyle[] = ['warm', 'white'];
const FONT_OVERRIDES: readonly FontOverride[] = ['default', 'sans', 'obsidian'];

export const DEFAULT_SETTINGS: InkstoneSettings = {
	enabled: true,
	darkModeEnabled: true,
	paperStyle: 'warm',
	fontOverride: 'default',
	fontScale: FONT_SCALE_DEFAULT,
	lineWidth: LINE_WIDTH_DEFAULT,
	effectsEnabled: true,
	revealEnabled: true,
	breathEnabled: true,
	focusEnabled: false,
	typewriterEnabled: true,
	typewriterSpeed: TYPEWRITER_SPEED_DEFAULT,
};

/** 夹取数值到 [min, max]；非法输入（缺省/非数）回退默认值。 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	const num = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(num)) return fallback;
	return Math.min(max, Math.max(min, Math.round(num)));
}

/** 夹取打字机速度到合法区间（PLAN §8.4）。 */
export function clampTypewriterSpeed(value: unknown): number {
	return clampNumber(value, TYPEWRITER_SPEED_MIN, TYPEWRITER_SPEED_MAX, TYPEWRITER_SPEED_DEFAULT);
}

/** 枚举字段白名单校验：不在合法值内的一律回退默认。 */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

/** settings.ts 与其他模块之间避免循环 import 的最小宿主形状。
 *  属性名避开 Plugin 基类（Obsidian v1.13+ 自带 settings 成员），故用 inkstoneSettings。 */
export interface SettingsHost extends Plugin {
	inkstoneSettings: InkstoneSettings;
}

/** 主插件为设置面板提供的应用入口（避免 settings.ts → main.ts 循环 import）。 */
export interface SettingsController {
	/** 保存当前设置并使其即时生效。 */
	applySettings(): void;
}

/** 读入 + 归一化：布尔字段拒绝非布尔脏值，枚举字段白名单校验，数值字段夹取。 */
export async function loadSettings(plugin: SettingsHost): Promise<void> {
	const stored = (await plugin.loadData()) as Partial<InkstoneSettings> | null;
	const merged = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	plugin.inkstoneSettings = {
		enabled: merged.enabled === true,
		darkModeEnabled: merged.darkModeEnabled !== false,
		paperStyle: pickEnum(merged.paperStyle, PAPER_STYLES, 'warm'),
		fontOverride: pickEnum(merged.fontOverride, FONT_OVERRIDES, 'default'),
		fontScale: clampNumber(merged.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_DEFAULT),
		lineWidth: clampNumber(merged.lineWidth, LINE_WIDTH_MIN, LINE_WIDTH_MAX, LINE_WIDTH_DEFAULT),
		effectsEnabled: merged.effectsEnabled !== false,
		revealEnabled: merged.revealEnabled !== false,
		breathEnabled: merged.breathEnabled !== false,
		focusEnabled: merged.focusEnabled === true,
		typewriterEnabled: merged.typewriterEnabled !== false,
		typewriterSpeed: clampTypewriterSpeed(merged.typewriterSpeed),
	};
}

export async function saveSettings(plugin: SettingsHost): Promise<void> {
	await plugin.saveData(plugin.inkstoneSettings);
}

/** 设置面板下拉项白名单守卫（onChange 回调收到 string，需收窄后再写入）。 */
function isPaperStyle(value: string): value is PaperStyle {
	return value === 'warm' || value === 'white';
}

/** 设置面板下拉项白名单守卫。 */
function isFontOverride(value: string): value is FontOverride {
	return value === 'default' || value === 'sans' || value === 'obsidian';
}

/**
 * 设置面板（PLAN §10 步骤 6）：全部经 Setting API 构建（setHeading 分节、
 * setToggle/setDropdown/setSlider 控件），不手写 HTML 标题元素（审核规范
 * no-manual-html-headings）；文案 sentence case；不设默认热键。
 */
export class InkstoneSettingTab extends PluginSettingTab {
	private readonly host: SettingsHost & SettingsController;

	constructor(app: App, host: SettingsHost & SettingsController) {
		super(app, host);
		this.host = host;
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.host.inkstoneSettings;
		const apply = (): void => this.host.applySettings();

		// —— 全局（PLAN §9：全局开关、暗色下是否生效）——
		new Setting(containerEl)
			.setName('Enable Inkstone')
			.setDesc(
				'Apply the Kami typesetting layer and effects to notes. A note can opt out with the frontmatter inkstone: false, or opt in with inkstone: true.',
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.enabled).onChange((value) => {
					settings.enabled = value;
					apply();
				}),
			);

		new Setting(containerEl)
			.setName('Active in dark mode')
			.setDesc('Keep Inkstone active while the app uses a dark theme. Turn off to leave dark themes untouched.')
			.addToggle((toggle) =>
				toggle.setValue(settings.darkModeEnabled).onChange((value) => {
					settings.darkModeEnabled = value;
					apply();
				}),
			);

		// —— 纸张（PLAN §9：纸张样式，暖纸默认 / 白纸打印变体）——
		new Setting(containerEl).setName('Paper').setHeading();

		new Setting(containerEl)
			.setName('Paper style')
			.setDesc(
				'Warm paper is the Kami default; white paper is the print variant. Frontmatter inkstone-paper: true or false overrides this per note (reading view).',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ warm: 'Warm paper', white: 'White paper' })
					.setValue(settings.paperStyle)
					.onChange((value) => {
						if (isPaperStyle(value)) {
							settings.paperStyle = value;
							apply();
						}
					}),
			);

		// —— 排版（PLAN §9：字体族覆盖、字号缩放、栏宽）——
		new Setting(containerEl).setName('Typography').setHeading();

		new Setting(containerEl)
			.setName('Font family')
			.setDesc(
				'Kami serif is the bundled default. Sans-serif switches to a plain sans stack; follow Obsidian uses the font chosen in the appearance settings.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ default: 'Kami serif', sans: 'Sans-serif', obsidian: 'Follow Obsidian' })
					.setValue(settings.fontOverride)
					.onChange((value) => {
						if (isFontOverride(value)) {
							settings.fontOverride = value;
							apply();
						}
					}),
			);

		new Setting(containerEl)
			.setName('Font size scale')
			.setDesc('Scale the whole type ladder up or down. The Kami default is 100.')
			.addSlider((slider) =>
				slider
					.setLimits(FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP)
					.setValue(settings.fontScale)
					.onChange((value) => {
						settings.fontScale = value;
						apply();
					}),
			);

		new Setting(containerEl)
			.setName('Column width')
			.setDesc('Maximum text column width in pixels. The Kami default is 700.')
			.addSlider((slider) =>
				slider
					.setLimits(LINE_WIDTH_MIN, LINE_WIDTH_MAX, LINE_WIDTH_STEP)
					.setValue(settings.lineWidth)
					.onChange((value) => {
						settings.lineWidth = value;
						apply();
					}),
			);

		// —— 动效（PLAN §9：效果总开关 + 四项独立开关 + 打字机速度）——
		new Setting(containerEl).setName('Effects').setHeading();

		// 效果总开关关闭时置灰四项独立开关（视觉联动，逻辑门控在消费端）
		const effectSettings: Setting[] = [];
		const syncEffectSettings = (): void => {
			for (const setting of effectSettings) setting.setDisabled(!settings.effectsEnabled);
		};

		new Setting(containerEl)
			.setName('Enable effects')
			.setDesc('Master switch for all micro-motion. Turn off to keep the static typesetting.')
			.addToggle((toggle) =>
				toggle.setValue(settings.effectsEnabled).onChange((value) => {
					settings.effectsEnabled = value;
					syncEffectSettings();
					apply();
				}),
			);

		const revealSetting = new Setting(containerEl)
			.setName('Scrolling reveal')
			.setDesc('Fade blocks in with an 8px rise as they enter the viewport, once per block (reading view).')
			.addToggle((toggle) =>
				toggle.setValue(settings.revealEnabled).onChange((value) => {
					settings.revealEnabled = value;
					apply();
				}),
			);

		const breathSetting = new Setting(containerEl)
			.setName('Interactive breathing')
			.setDesc('Hover feedback on cards and links: a 1px lift with a deepening border, and underline growth.')
			.addToggle((toggle) =>
				toggle.setValue(settings.breathEnabled).onChange((value) => {
					settings.breathEnabled = value;
					apply();
				}),
			);

		const focusSetting = new Setting(containerEl)
			.setName('Focus reading')
			.setDesc('Dim paragraphs outside the middle band of the viewport while reading (reading view).')
			.addToggle((toggle) =>
				toggle.setValue(settings.focusEnabled).onChange((value) => {
					settings.focusEnabled = value;
					apply();
				}),
			);

		const typewriterSetting = new Setting(containerEl)
			.setName('Typewriter')
			.setDesc('Allow the typewriter command to play on the active reading view. The command has no default hotkey.')
			.addToggle((toggle) =>
				toggle.setValue(settings.typewriterEnabled).onChange((value) => {
					settings.typewriterEnabled = value;
					apply();
				}),
			);

		const speedSetting = new Setting(containerEl)
			.setName('Typewriter speed')
			.setDesc('Characters revealed per second when the typewriter command plays.')
			.addSlider((slider) =>
				slider
					.setLimits(TYPEWRITER_SPEED_MIN, TYPEWRITER_SPEED_MAX, 1)
					.setValue(settings.typewriterSpeed)
					.onChange((value) => {
						settings.typewriterSpeed = clampTypewriterSpeed(value);
						apply();
					}),
			);

		effectSettings.push(revealSetting, breathSetting, focusSetting, typewriterSetting, speedSetting);
		syncEffectSettings();
	}
}
