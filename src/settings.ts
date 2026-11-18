import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	requireApiVersion,
	type SettingDefinitionItem,
} from 'obsidian';

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

/** 下拉选项（display() 与 getSettingDefinitions() 共用，两路文案不漂移）。 */
const PAPER_OPTIONS: Record<string, string> = { warm: 'Warm paper', white: 'White paper' };
const FONT_OPTIONS: Record<string, string> = {
	default: 'Kami serif',
	sans: 'Sans-serif',
	obsidian: 'Follow Obsidian',
};

/** 设置项名称单一来源：display()（<1.13 回退路径）与 getSettingDefinitions()
 *  （1.13+ 声明式路径）共用，保证渲染与设置搜索的文案一致（复审第 1 轮 §7）。 */
const LABEL = {
	enable: 'Enable Inkstone',
	darkMode: 'Active in dark mode',
	paperHeading: 'Paper',
	paperStyle: 'Paper style',
	typographyHeading: 'Typography',
	fontFamily: 'Font family',
	fontScale: 'Font size scale',
	lineWidth: 'Column width',
	effectsHeading: 'Effects',
	effects: 'Enable effects',
	reveal: 'Scrolling reveal',
	breath: 'Interactive breathing',
	focus: 'Focus reading',
	typewriter: 'Typewriter',
	typewriterSpeed: 'Typewriter speed',
} as const;

/** 设置项描述单一来源（两路共用）。 */
const DESC = {
	enable: 'Apply the Kami typesetting layer and effects to notes. A note can opt out with the frontmatter inkstone: false, or opt in with inkstone: true.',
	darkMode:
		'Keep Inkstone active while the app uses a dark theme. Turn off to leave dark themes untouched.',
	paperStyle:
		'Warm paper is the Kami default; white paper is the print variant. Frontmatter inkstone-paper: true or false overrides this per note (reading view).',
	fontFamily:
		'Kami serif is the bundled default. Sans-serif switches to a plain sans stack; follow Obsidian uses the font chosen in the appearance settings.',
	fontScale: 'Scale the whole type ladder up or down. The Kami default is 100.',
	lineWidth: 'Maximum text column width in pixels. The Kami default is 700.',
	effects: 'Master switch for all micro-motion. Turn off to keep the static typesetting.',
	reveal: 'Fade blocks in with an 8px rise as they enter the viewport, once per block (reading view).',
	breath: 'Hover feedback on cards and links: a 1px lift with a deepening border, and underline growth.',
	focus: 'Dim paragraphs outside the middle band of the viewport while reading (reading view).',
	typewriter:
		'Allow the typewriter command to play on the active reading view. The command has no default hotkey.',
	typewriterSpeed: 'Characters revealed per second when the typewriter command plays.',
} as const;

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
	/** 应用当前设置：作用域级变更由插件自动重渲染阅读视图，其余经 CSS 变量与
	 *  body 类即时生效；落盘去抖（复审第 1 轮 §1）。 */
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
 * 设置面板（PLAN §10 步骤 6）：全部经 Setting API 构建，不手写 HTML 标题元素
 * （审核规范 no-manual-html-headings）；文案 sentence case；不设默认热键。
 * 双路径渲染（复审第 1 轮 §7）：
 * - getSettingDefinitions()：Obsidian 1.13+ 声明式 API，设置进入全局搜索；
 * - display()：<1.13 的命令式回退（manifest minAppVersion 1.5.0）。
 * 两条路径的文案与控件参数一律取 LABEL/DESC/选项常量；eslint-plugin-obsidianmd
 * 对 minAppVersion < 1.13 同时要求 display() 存在（require-display）。
 */
export class InkstoneSettingTab extends PluginSettingTab {
	private readonly host: SettingsHost & SettingsController;

	constructor(app: App, host: SettingsHost & SettingsController) {
		super(app, host);
		this.host = host;
	}

	/** 声明式设置定义（1.13+ 渲染与设置搜索索引的唯一来源）。 */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.host.inkstoneSettings;
		const effectsOff = (): boolean => !settings.effectsEnabled;
		return [
			{ name: LABEL.enable, desc: DESC.enable, control: { type: 'toggle', key: 'enabled' } },
			{
				name: LABEL.darkMode,
				desc: DESC.darkMode,
				control: { type: 'toggle', key: 'darkModeEnabled' },
			},
			{
				type: 'group',
				heading: LABEL.paperHeading,
				items: [
					{
						name: LABEL.paperStyle,
						desc: DESC.paperStyle,
						control: { type: 'dropdown', key: 'paperStyle', options: PAPER_OPTIONS },
					},
				],
			},
			{
				type: 'group',
				heading: LABEL.typographyHeading,
				items: [
					{
						name: LABEL.fontFamily,
						desc: DESC.fontFamily,
						control: { type: 'dropdown', key: 'fontOverride', options: FONT_OPTIONS },
					},
					{
						name: LABEL.fontScale,
						desc: DESC.fontScale,
						control: {
							type: 'slider',
							key: 'fontScale',
							min: FONT_SCALE_MIN,
							max: FONT_SCALE_MAX,
							step: FONT_SCALE_STEP,
						},
					},
					{
						name: LABEL.lineWidth,
						desc: DESC.lineWidth,
						control: {
							type: 'slider',
							key: 'lineWidth',
							min: LINE_WIDTH_MIN,
							max: LINE_WIDTH_MAX,
							step: LINE_WIDTH_STEP,
						},
					},
				],
			},
			{
				type: 'group',
				heading: LABEL.effectsHeading,
				items: [
					{
						name: LABEL.effects,
						desc: DESC.effects,
						control: { type: 'toggle', key: 'effectsEnabled' },
					},
					{
						name: LABEL.reveal,
						desc: DESC.reveal,
						control: { type: 'toggle', key: 'revealEnabled', disabled: effectsOff },
					},
					{
						name: LABEL.breath,
						desc: DESC.breath,
						control: { type: 'toggle', key: 'breathEnabled', disabled: effectsOff },
					},
					{
						name: LABEL.focus,
						desc: DESC.focus,
						control: { type: 'toggle', key: 'focusEnabled', disabled: effectsOff },
					},
					{
						name: LABEL.typewriter,
						desc: DESC.typewriter,
						control: { type: 'toggle', key: 'typewriterEnabled', disabled: effectsOff },
					},
					{
						name: LABEL.typewriterSpeed,
						desc: DESC.typewriterSpeed,
						control: {
							type: 'slider',
							key: 'typewriterSpeed',
							min: TYPEWRITER_SPEED_MIN,
							max: TYPEWRITER_SPEED_MAX,
							step: 1,
							disabled: effectsOff,
						},
					},
				],
			},
		];
	}

	/** 声明式控件读值（1.13+）：宿主设置对象即存储。 */
	override getControlValue(key: string): unknown {
		return (this.host.inkstoneSettings as unknown as Record<string, unknown>)[key];
	}

	/** 声明式控件写值（1.13+）：归一口径与 loadSettings 一致，写后即时生效；
	 *  effectsEnabled 翻转影响其余开关的 disabled 判定，refreshDomState 就地重估。 */
	override setControlValue(key: string, value: unknown): void {
		const settings = this.host.inkstoneSettings;
		switch (key) {
			case 'enabled':
				settings.enabled = value === true;
				break;
			case 'darkModeEnabled':
				settings.darkModeEnabled = value !== false;
				break;
			case 'paperStyle':
				if (isPaperStyle(String(value))) settings.paperStyle = value as PaperStyle;
				break;
			case 'fontOverride':
				if (isFontOverride(String(value))) settings.fontOverride = value as FontOverride;
				break;
			case 'fontScale':
				settings.fontScale = clampNumber(value, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_DEFAULT);
				break;
			case 'lineWidth':
				settings.lineWidth = clampNumber(value, LINE_WIDTH_MIN, LINE_WIDTH_MAX, LINE_WIDTH_DEFAULT);
				break;
			case 'effectsEnabled':
				settings.effectsEnabled = value !== false;
				break;
			case 'revealEnabled':
				settings.revealEnabled = value !== false;
				break;
			case 'breathEnabled':
				settings.breathEnabled = value !== false;
				break;
			case 'focusEnabled':
				settings.focusEnabled = value === true;
				break;
			case 'typewriterEnabled':
				settings.typewriterEnabled = value !== false;
				break;
			case 'typewriterSpeed':
				settings.typewriterSpeed = clampTypewriterSpeed(value);
				break;
			default:
				return;
		}
		this.host.applySettings();
		// refreshDomState 是 1.13.0+ API（minAppVersion 1.5.0 → 运行时版本守卫）：
		// 仅声明式渲染路径存在时才需要就地重估 disabled 判定
		if (requireApiVersion('1.13.0')) this.refreshDomState();
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.host.inkstoneSettings;
		const apply = (): void => this.host.applySettings();

		// —— 全局（PLAN §9：全局开关、暗色下是否生效）——
		new Setting(containerEl)
			.setName(LABEL.enable)
			.setDesc(DESC.enable)
			.addToggle((toggle) =>
				toggle.setValue(settings.enabled).onChange((value) => {
					settings.enabled = value;
					apply();
				}),
			);

		new Setting(containerEl)
			.setName(LABEL.darkMode)
			.setDesc(DESC.darkMode)
			.addToggle((toggle) =>
				toggle.setValue(settings.darkModeEnabled).onChange((value) => {
					settings.darkModeEnabled = value;
					apply();
				}),
			);

		// —— 纸张（PLAN §9：纸张样式，暖纸默认 / 白纸打印变体）——
		new Setting(containerEl).setName(LABEL.paperHeading).setHeading();

		new Setting(containerEl)
			.setName(LABEL.paperStyle)
			.setDesc(DESC.paperStyle)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(PAPER_OPTIONS)
					.setValue(settings.paperStyle)
					.onChange((value) => {
						if (isPaperStyle(value)) {
							settings.paperStyle = value;
							apply();
						}
					}),
			);

		// —— 排版（PLAN §9：字体族覆盖、字号缩放、栏宽）——
		new Setting(containerEl).setName(LABEL.typographyHeading).setHeading();

		new Setting(containerEl)
			.setName(LABEL.fontFamily)
			.setDesc(DESC.fontFamily)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(FONT_OPTIONS)
					.setValue(settings.fontOverride)
					.onChange((value) => {
						if (isFontOverride(value)) {
							settings.fontOverride = value;
							apply();
						}
					}),
			);

		new Setting(containerEl)
			.setName(LABEL.fontScale)
			.setDesc(DESC.fontScale)
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
			.setName(LABEL.lineWidth)
			.setDesc(DESC.lineWidth)
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
		new Setting(containerEl).setName(LABEL.effectsHeading).setHeading();

		// 效果总开关关闭时置灰四项独立开关（视觉联动，逻辑门控在消费端）
		const effectSettings: Setting[] = [];
		const syncEffectSettings = (): void => {
			for (const setting of effectSettings) setting.setDisabled(!settings.effectsEnabled);
		};

		new Setting(containerEl)
			.setName(LABEL.effects)
			.setDesc(DESC.effects)
			.addToggle((toggle) =>
				toggle.setValue(settings.effectsEnabled).onChange((value) => {
					settings.effectsEnabled = value;
					syncEffectSettings();
					apply();
				}),
			);

		const revealSetting = new Setting(containerEl)
			.setName(LABEL.reveal)
			.setDesc(DESC.reveal)
			.addToggle((toggle) =>
				toggle.setValue(settings.revealEnabled).onChange((value) => {
					settings.revealEnabled = value;
					apply();
				}),
			);

		const breathSetting = new Setting(containerEl)
			.setName(LABEL.breath)
			.setDesc(DESC.breath)
			.addToggle((toggle) =>
				toggle.setValue(settings.breathEnabled).onChange((value) => {
					settings.breathEnabled = value;
					apply();
				}),
			);

		const focusSetting = new Setting(containerEl)
			.setName(LABEL.focus)
			.setDesc(DESC.focus)
			.addToggle((toggle) =>
				toggle.setValue(settings.focusEnabled).onChange((value) => {
					settings.focusEnabled = value;
					apply();
				}),
			);

		const typewriterSetting = new Setting(containerEl)
			.setName(LABEL.typewriter)
			.setDesc(DESC.typewriter)
			.addToggle((toggle) =>
				toggle.setValue(settings.typewriterEnabled).onChange((value) => {
					settings.typewriterEnabled = value;
					apply();
				}),
			);

		const speedSetting = new Setting(containerEl)
			.setName(LABEL.typewriterSpeed)
			.setDesc(DESC.typewriterSpeed)
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
