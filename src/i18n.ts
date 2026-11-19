/**
 * 界面文案字典（PLAN §14 C）：中英双语的唯一来源。
 * 设置项名称/说明、下拉显示名、命令名与 Notice 全部经 `createTranslator()`
 * 返回的 t(key) 取词；键是稳定标识，只承载语言键值，不进入 data.json。
 * 英文一律 sentence case（Obsidian 审核规范）。
 */

/** 界面语言设置值：auto 跟随系统，zh/en 手动指定。 */
export type LanguageSetting = 'auto' | 'zh' | 'en';
/** 解析后的实际语言：auto 只决定取向，最终落到 zh/en。 */
export type ResolvedLanguage = 'zh' | 'en';

/** 设置面板白名单（loadSettings 与下拉守卫共用）。 */
export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'zh', 'en'];

/** 设置值校验：非法值回退 auto。 */
export function isLanguageSetting(value: unknown): value is LanguageSetting {
	return value === 'auto' || value === 'zh' || value === 'en';
}

/** auto 取 navigator.language，以 zh 开头为中文，否则英文（PLAN §14 C）。 */
export function resolveLanguage(language: LanguageSetting): ResolvedLanguage {
	if (language === 'zh' || language === 'en') return language;
	const systemLanguage =
		typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
	return systemLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** 双语键值对：两份译文并列存放，新增键必须同时补齐两语。 */
interface Bilingual {
	readonly zh: string;
	readonly en: string;
}

/** 设置项名称（含 setHeading 分节标题）。 */
export const LABELS = {
	interfaceHeading: { zh: '界面', en: 'Interface' },
	language: { zh: '界面语言', en: 'Interface language' },
	enable: { zh: '启用 Inkstone', en: 'Enable Inkstone' },
	darkMode: { zh: '暗色模式下生效', en: 'Active in dark mode' },
	paperHeading: { zh: '纸张', en: 'Paper' },
	paperStyle: { zh: '纸张样式', en: 'Paper style' },
	typographyHeading: { zh: '排版', en: 'Typography' },
	fontFamily: { zh: '字体族', en: 'Font family' },
	fontScale: { zh: '字号缩放', en: 'Font size scale' },
	lineWidth: { zh: '栏宽', en: 'Column width' },
	effectsHeading: { zh: '动效', en: 'Effects' },
	effects: { zh: '启用动效', en: 'Enable effects' },
	reveal: { zh: '滚动渐显', en: 'Scrolling reveal' },
	breath: { zh: '交互呼吸', en: 'Interactive breathing' },
	focus: { zh: '聚焦阅读', en: 'Focus reading' },
	typewriter: { zh: '打字机', en: 'Typewriter' },
	typewriterSpeed: { zh: '打字机速度', en: 'Typewriter speed' },
} as const satisfies Record<string, Bilingual>;

/** 设置项说明。 */
export const DESCS = {
	language: {
		zh: '自动跟随系统语言。设置页即时更新；命令名称在重启 Obsidian 后更新。',
		en: 'Auto follows the system language. The settings page updates at once; command names update after restarting Obsidian.',
	},
	enable: {
		zh: '把 Kami 排版层与动效应用到笔记。单篇可用 frontmatter inkstone: false 关闭，或用 inkstone: true 强制开启。',
		en: 'Apply the Kami typesetting layer and effects to notes. A note can opt out with the frontmatter inkstone: false, or opt in with inkstone: true.',
	},
	darkMode: {
		zh: '应用处于暗色主题时仍保持 Inkstone 生效。关闭后不干预暗色主题。',
		en: 'Keep Inkstone active while the app uses a dark theme. Turn off to leave dark themes untouched.',
	},
	paperStyle: {
		zh: '暖纸是 Kami 默认，白纸是打印变体。单篇可用 frontmatter inkstone-paper: true 或 false 覆盖（阅读模式）。',
		en: 'Warm paper is the Kami default; white paper is the print variant. Frontmatter inkstone-paper: true or false overrides this per note (reading view).',
	},
	fontFamily: {
		zh: 'Kami 衬线是随包默认。无衬线切换为系统无衬线栈；跟随 Obsidian 使用外观设置中选定的字体。',
		en: 'Kami serif is the bundled default. Sans-serif switches to a plain sans stack; follow Obsidian uses the font chosen in the appearance settings.',
	},
	fontScale: {
		zh: '整体放大或缩小字号阶梯。100% 为跟随 Obsidian 字号。',
		en: 'Scale the whole type ladder up or down. 100% follows the Obsidian font size.',
	},
	lineWidth: {
		zh: '文本栏宽上限，单位为像素。Kami 默认 700。',
		en: 'Maximum text column width in pixels. The Kami default is 700.',
	},
	effects: {
		zh: '全部微动效的总开关。关闭后只保留静态排版。',
		en: 'Master switch for all micro-motion. Turn off to keep the static typesetting.',
	},
	reveal: {
		zh: '内容块进入视口时淡入并上浮 8px，每块只触发一次（阅读模式）。',
		en: 'Fade blocks in with an 8px rise as they enter the viewport, once per block (reading view).',
	},
	breath: {
		zh: '卡片与链接的悬停反馈：上浮 1px、描边加深，链接下划线生长。',
		en: 'Hover feedback on cards and links: a 1px lift with a deepening border, and underline growth.',
	},
	focus: {
		zh: '阅读时让视口中带之外的段落退灰（阅读模式）。',
		en: 'Dim paragraphs outside the middle band of the viewport while reading (reading view).',
	},
	typewriter: {
		zh: '允许打字机命令在当前阅读视图播放。该命令不设默认热键。',
		en: 'Allow the typewriter command to play on the active reading view. The command has no default hotkey.',
	},
	typewriterSpeed: {
		zh: '打字机命令播放时每秒显现的字符数。',
		en: 'Characters revealed per second when the typewriter command plays.',
	},
} as const satisfies Record<string, Bilingual>;

/** 命令面板名称（插件加载时按当前语言注册）。 */
export const COMMANDS = {
	playTypewriter: { zh: '播放打字机效果', en: 'Play typewriter effect' },
} as const satisfies Record<string, Bilingual>;

/** 通知文本。 */
export const NOTICES = {
	languageChanged: {
		zh: '界面语言已切换。命令面板中的命令名称将在重启 Obsidian 后更新。',
		en: 'Interface language changed. Command names in the command palette update after restarting Obsidian.',
	},
} as const satisfies Record<string, Bilingual>;

/** 下拉项显示名（值只存语言键值，见 settings.ts 的类型守卫）。 */
export const OPTIONS = {
	paperWarm: { zh: '暖纸', en: 'Warm paper' },
	paperWhite: { zh: '白纸', en: 'White paper' },
	fontDefault: { zh: 'Kami 衬线', en: 'Kami serif' },
	fontSans: { zh: '无衬线', en: 'Sans-serif' },
	fontObsidian: { zh: '跟随 Obsidian', en: 'Follow Obsidian' },
	languageAuto: { zh: '自动（跟随系统）', en: 'Auto (follow system)' },
	languageZh: { zh: '中文', en: '中文' },
	languageEn: { zh: 'English', en: 'English' },
} as const satisfies Record<string, Bilingual>;

const TABLES = {
	label: LABELS,
	desc: DESCS,
	command: COMMANDS,
	notice: NOTICES,
	option: OPTIONS,
} as const;

/** 取词键：`表名.键名`，编译期校验拼写。 */
export type MessageKey =
	| `label.${keyof typeof LABELS}`
	| `desc.${keyof typeof DESCS}`
	| `command.${keyof typeof COMMANDS}`
	| `notice.${keyof typeof NOTICES}`
	| `option.${keyof typeof OPTIONS}`;

/** 按语言解析后的取词函数。 */
export type Translator = (key: MessageKey) => string;

/** 生成 t(key)：语言在渲染时解析，切换语言只需新建翻译器（PLAN §14 C）。 */
export function createTranslator(language: ResolvedLanguage): Translator {
	return (key) => {
		const separator = key.indexOf('.');
		const table = TABLES[key.slice(0, separator) as keyof typeof TABLES] as Record<
			string,
			Bilingual
		>;
		return table[key.slice(separator + 1)]?.[language] ?? key;
	};
}
