import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requireApiVersion,
	type SettingDefinitionItem,
} from 'obsidian';
import {
	LANGUAGE_SETTINGS,
	createTranslator,
	isLanguageSetting,
	resolveLanguage,
	type LanguageSetting,
	type Translator,
} from './i18n';

/**
 * Inkstone 设置（PLAN §9 全量）。
 * 结构：界面语言 / 全局开关 / 暗色门控 / 纸张样式 / 字体族覆盖 / 字号缩放 / 栏宽 /
 * 效果总开关 + 四项独立开关（滚动渐显、交互呼吸、聚焦阅读、打字机）/ 打字机速度。
 * 文案一律经 i18n.ts 的 t(key) 取词（PLAN §14 C）：本文件只持有语言键值，
 * data.json 不落任何译文；设置页面每次渲染按当前语言重新解析文案。
 * frontmatter 覆盖语义见 scope.ts：`inkstone` 与 `inkstone-paper` 均可单篇双向覆盖。
 */

/** 纸张样式：暖纸（Kami 默认）或白纸打印变体。 */
export type PaperStyle = 'warm' | 'white';
/** 字体族覆盖：默认 Kami 衬线栈 / 无衬线栈 / 跟随 Obsidian 外观字体。 */
export type FontOverride = 'default' | 'sans' | 'obsidian';

export interface InkstoneSettings {
	/** 界面语言：auto 跟随系统（navigator.language），zh/en 手动指定（PLAN §14 C）。 */
	language: LanguageSetting;
	/** 全局总开关：关闭时插件不做任何排版干预（frontmatter `inkstone: true` 仍可单篇开启）。 */
	enabled: boolean;
	/** 暗色下是否生效：关闭后应用处于暗色主题时插件整体不生效（PLAN §9）。 */
	darkModeEnabled: boolean;
	/** 纸张样式：暖纸（Kami 默认）或白纸打印变体（frontmatter `inkstone-paper` 可单篇覆盖）。 */
	paperStyle: PaperStyle;
	/** 字体族覆盖（PLAN §9）。 */
	fontOverride: FontOverride;
	/** 字号缩放：Obsidian 字号的百分比倍率（100 = 完全跟随 Obsidian），读入时夹取至合法区间。 */
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

/** 字号缩放范围（百分比，步进 5；100 = 完全跟随 Obsidian 字号）。 */
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

/** 下拉选项的显示名每次渲染按当前语言解析（值仍是稳定键，见 data.json 只存键值）。 */
function paperOptions(t: Translator): Record<string, string> {
	return { warm: t('option.paperWarm'), white: t('option.paperWhite') };
}

function fontOptions(t: Translator): Record<string, string> {
	return {
		default: t('option.fontDefault'),
		sans: t('option.fontSans'),
		obsidian: t('option.fontObsidian'),
	};
}

function languageOptions(t: Translator): Record<string, string> {
	return {
		auto: t('option.languageAuto'),
		zh: t('option.languageZh'),
		en: t('option.languageEn'),
	};
}

export const DEFAULT_SETTINGS: InkstoneSettings = {
	language: 'auto',
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
		language: pickEnum(merged.language, LANGUAGE_SETTINGS, 'auto'),
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
 * 两条路径的文案一律经 t(key) 从 i18n.ts 取词（PLAN §14 C），不各写一份。
 * eslint-plugin-obsidianmd 对 minAppVersion < 1.13 同时要求 display() 存在
 * （require-display）。
 */
export class InkstoneSettingTab extends PluginSettingTab {
	private readonly host: SettingsHost & SettingsController;

	constructor(app: App, host: SettingsHost & SettingsController) {
		super(app, host);
		this.host = host;
	}

	/** 当前语言的取词器：语言在渲染时解析，切换语言即重建面板（PLAN §14 C）。 */
	private translator(): Translator {
		return createTranslator(resolveLanguage(this.host.inkstoneSettings.language));
	}

	/** 声明式设置定义（1.13+ 渲染与设置搜索索引的唯一来源）。 */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		const t = this.translator();
		const settings = this.host.inkstoneSettings;
		const effectsOff = (): boolean => !settings.effectsEnabled;
		return [
			{
				type: 'group',
				heading: t('label.interfaceHeading'),
				items: [
					{
						name: t('label.language'),
						desc: t('desc.language'),
						control: {
							type: 'dropdown',
							key: 'language',
							options: languageOptions(t),
						},
					},
				],
			},
			{ name: t('label.enable'), desc: t('desc.enable'), control: { type: 'toggle', key: 'enabled' } },
			{
				name: t('label.darkMode'),
				desc: t('desc.darkMode'),
				control: { type: 'toggle', key: 'darkModeEnabled' },
			},
			{
				type: 'group',
				heading: t('label.paperHeading'),
				items: [
					{
						name: t('label.paperStyle'),
						desc: t('desc.paperStyle'),
						control: {
							type: 'dropdown',
							key: 'paperStyle',
							options: paperOptions(t),
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('label.typographyHeading'),
				items: [
					{
						name: t('label.fontFamily'),
						desc: t('desc.fontFamily'),
						control: {
							type: 'dropdown',
							key: 'fontOverride',
							options: fontOptions(t),
						},
					},
					{
						name: t('label.fontScale'),
						desc: t('desc.fontScale'),
						control: {
							type: 'slider',
							key: 'fontScale',
							min: FONT_SCALE_MIN,
							max: FONT_SCALE_MAX,
							step: FONT_SCALE_STEP,
						},
					},
					{
						name: t('label.lineWidth'),
						desc: t('desc.lineWidth'),
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
				heading: t('label.effectsHeading'),
				items: [
					{
						name: t('label.effects'),
						desc: t('desc.effects'),
						control: { type: 'toggle', key: 'effectsEnabled' },
					},
					{
						name: t('label.reveal'),
						desc: t('desc.reveal'),
						control: { type: 'toggle', key: 'revealEnabled', disabled: effectsOff },
					},
					{
						name: t('label.breath'),
						desc: t('desc.breath'),
						control: { type: 'toggle', key: 'breathEnabled', disabled: effectsOff },
					},
					{
						name: t('label.focus'),
						desc: t('desc.focus'),
						control: { type: 'toggle', key: 'focusEnabled', disabled: effectsOff },
					},
					{
						name: t('label.typewriter'),
						desc: t('desc.typewriter'),
						control: { type: 'toggle', key: 'typewriterEnabled', disabled: effectsOff },
					},
					{
						name: t('label.typewriterSpeed'),
						desc: t('desc.typewriterSpeed'),
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
	 *  effectsEnabled 翻转影响其余开关的 disabled 判定，refreshDomState 就地重估。
	 *  language 走独立的切换路径：落键值、重建面板、提示命令名随重启更新。 */
	override setControlValue(key: string, value: unknown): void {
		const settings = this.host.inkstoneSettings;
		if (key === 'language') {
			if (isLanguageSetting(value)) this.changeLanguage(value);
			return;
		}
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

	/**
	 * 语言切换（1.13+ 与 <1.13 共用）：只改语言键值并落盘；解析后的语言变了才
	 * 立即重建设置页，并以新语言提示命令名随重启更新。命令不在此时重复注册
	 * （PLAN §14 C）。
	 */
	private changeLanguage(next: LanguageSetting): void {
		const settings = this.host.inkstoneSettings;
		const previous = resolveLanguage(settings.language);
		settings.language = next;
		this.host.applySettings();
		const resolved = resolveLanguage(next);
		if (resolved === previous) return;
		this.rebuild();
		new Notice(createTranslator(resolved)('notice.languageChanged'));
	}

	/** 1.13+ 用声明式 update()（重读 definitions，搜索索引同步刷新）；
	 *  <1.13 重绘命令式面板。 */
	private rebuild(): void {
		if (requireApiVersion('1.13.0')) this.update();
		else this.renderSettingsPage();
	}

	/** <1.13 命令式回退入口（display 自 1.13 起废弃，仅在旧版被框架调用）。 */
	override display(): void {
		this.renderSettingsPage();
	}

	/** 命令式面板的实际渲染体：语言切换时也直接调用它重建，避免触发
	 *  对弃用 display() 的调用。 */
	private renderSettingsPage(): void {
		const { containerEl } = this;
		containerEl.empty();
		const t = this.translator();
		const settings = this.host.inkstoneSettings;
		const apply = (): void => this.host.applySettings();

		// —— 界面（PLAN §14 C：界面语言）——
		new Setting(containerEl).setName(t('label.interfaceHeading')).setHeading();

		new Setting(containerEl)
			.setName(t('label.language'))
			.setDesc(t('desc.language'))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(languageOptions(t))
					.setValue(settings.language)
					.onChange((value) => {
						if (isLanguageSetting(value)) this.changeLanguage(value);
					}),
			);

		// —— 全局（PLAN §9：全局开关、暗色下是否生效）——
		new Setting(containerEl)
			.setName(t('label.enable'))
			.setDesc(t('desc.enable'))
			.addToggle((toggle) =>
				toggle.setValue(settings.enabled).onChange((value) => {
					settings.enabled = value;
					apply();
				}),
			);

		new Setting(containerEl)
			.setName(t('label.darkMode'))
			.setDesc(t('desc.darkMode'))
			.addToggle((toggle) =>
				toggle.setValue(settings.darkModeEnabled).onChange((value) => {
					settings.darkModeEnabled = value;
					apply();
				}),
			);

		// —— 纸张（PLAN §9：纸张样式，暖纸默认 / 白纸打印变体）——
		new Setting(containerEl).setName(t('label.paperHeading')).setHeading();

		new Setting(containerEl)
			.setName(t('label.paperStyle'))
			.setDesc(t('desc.paperStyle'))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(paperOptions(t))
					.setValue(settings.paperStyle)
					.onChange((value) => {
						if (isPaperStyle(value)) {
							settings.paperStyle = value;
							apply();
						}
					}),
			);

		// —— 排版（PLAN §9：字体族覆盖、字号缩放、栏宽）——
		new Setting(containerEl).setName(t('label.typographyHeading')).setHeading();

		new Setting(containerEl)
			.setName(t('label.fontFamily'))
			.setDesc(t('desc.fontFamily'))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(fontOptions(t))
					.setValue(settings.fontOverride)
					.onChange((value) => {
						if (isFontOverride(value)) {
							settings.fontOverride = value;
							apply();
						}
					}),
			);

		new Setting(containerEl)
			.setName(t('label.fontScale'))
			.setDesc(t('desc.fontScale'))
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
			.setName(t('label.lineWidth'))
			.setDesc(t('desc.lineWidth'))
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
		new Setting(containerEl).setName(t('label.effectsHeading')).setHeading();

		// 效果总开关关闭时置灰四项独立开关（视觉联动，逻辑门控在消费端）
		const effectSettings: Setting[] = [];
		const syncEffectSettings = (): void => {
			for (const setting of effectSettings) setting.setDisabled(!settings.effectsEnabled);
		};

		new Setting(containerEl)
			.setName(t('label.effects'))
			.setDesc(t('desc.effects'))
			.addToggle((toggle) =>
				toggle.setValue(settings.effectsEnabled).onChange((value) => {
					settings.effectsEnabled = value;
					syncEffectSettings();
					apply();
				}),
			);

		const revealSetting = new Setting(containerEl)
			.setName(t('label.reveal'))
			.setDesc(t('desc.reveal'))
			.addToggle((toggle) =>
				toggle.setValue(settings.revealEnabled).onChange((value) => {
					settings.revealEnabled = value;
					apply();
				}),
			);

		const breathSetting = new Setting(containerEl)
			.setName(t('label.breath'))
			.setDesc(t('desc.breath'))
			.addToggle((toggle) =>
				toggle.setValue(settings.breathEnabled).onChange((value) => {
					settings.breathEnabled = value;
					apply();
				}),
			);

		const focusSetting = new Setting(containerEl)
			.setName(t('label.focus'))
			.setDesc(t('desc.focus'))
			.addToggle((toggle) =>
				toggle.setValue(settings.focusEnabled).onChange((value) => {
					settings.focusEnabled = value;
					apply();
				}),
			);

		const typewriterSetting = new Setting(containerEl)
			.setName(t('label.typewriter'))
			.setDesc(t('desc.typewriter'))
			.addToggle((toggle) =>
				toggle.setValue(settings.typewriterEnabled).onChange((value) => {
					settings.typewriterEnabled = value;
					apply();
				}),
			);

		const speedSetting = new Setting(containerEl)
			.setName(t('label.typewriterSpeed'))
			.setDesc(t('desc.typewriterSpeed'))
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
