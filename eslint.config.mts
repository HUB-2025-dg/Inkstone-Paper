import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		// 会话工具暂存目录（.gitignore 已排除），非插件代码
		'.zcode',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// Inkstone（本插件名，manifest.json name）与 Kami（tw93/kami 设计系统品牌）
			// 是专有品牌名，保留正字法大小写；小写 inkstone 同时是 frontmatter 键名
			// （`inkstone: false` 单篇关闭），键名必须按笔记里的原样小写保留，
			// 故用 ignoreWords 精确大小写白名单而非 brands（brands 会把键名强制大写，
			// 且顶掉规则内置品牌表导致 Obsidian 被误判小写）
			'obsidianmd/ui/sentence-case': [
				'warn',
				{ ignoreWords: ['Inkstone', 'inkstone', 'Kami', 'kami'] },
			],
		},
	},
);
