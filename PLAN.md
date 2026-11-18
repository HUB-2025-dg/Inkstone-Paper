# Inkstone 纸研 — 实施蓝图

> 本文件是唯一蓝图。每次继续开发：先完整读它 → 做未完成步骤 → 勾掉并更新状态。
> 设计系统出处：tw93/kami（MIT，本地 checkout `D:\Kami`）。本插件为其非官方衍生。

## 0. 一句话

Inkstone 纸研：自带 Kami 排版层与克制动效的 Obsidian 插件，让笔记以印刷级的纸感排版呈现。高级感来自字距、留白与油墨蓝，动效只做信息的服务。

## 1. 背景与定位

- **思想来源**：tw93/kami（`D:\Kami`）——暖纸底 `#f5f4ed`、油墨蓝 `#1B365D` 单一强调、衬线承载层级、暖调灰、4pt 间距基、表面平坦、装饰必须有信息职责。
- **既有静态移植**：社区主题 Kami Reader（KKenny0/obsidian-kami，CSS）已覆盖全局静态换装 + 工作区外壳。主题做不到的事是本插件的存在理由：按笔记粒度生效、frontmatter 覆盖、JS 微动效、由数据驱动的行为。
- **定位**：插件自带完整排版层（不依赖任何主题，ADR-0001），再叠一层克制动效。与 Kami Reader 互补而非竞争。

## 2. 已确认决策（三轮访谈收敛，2026-11-19）

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 定位 | 自带排版 + 动效一体，不依赖任何主题（ADR-0001） |
| 2 | 哲学 | Kami 本味克制：排版/留白/油墨蓝，动效仅细微过渡 |
| 3 | 生效 | 全局开关 + frontmatter 覆盖（`inkstone: false` 单篇关闭） |
| 4 | 合规 | Obsidian 审核规范 + eslint-plugin-obsidianmd recommended 全绿 |
| 5 | 排版 | 全套 markdown→Kami 组件映射（见 §7） |
| 6 | 字体 | 打包 OFL 字体：霞鹜文楷屏幕版 + JetBrains Mono（ADR-0002） |
| 7 | 动效 | 滚动渐显、交互呼吸、聚焦阅读、打字机（开关+速度可调） |
| 8 | 模式 | 阅读模式完整；Live Preview 只生效排版令牌，无动效（ADR-0003） |
| 9 | 命名 | Inkstone 纸研，id `inkstone`（ADR-0004） |
| 10 | 节奏 | v1.0 一次做完；终点 = lint 0 错 + 构建通过 + 验收清单全过 + README/manifest 齐备 |
| 11 | 验收 | 真实 vault `D:\13757\Documents\学习\spark-cache` |
| 12 | 默认项 | 明暗双模式（Kami deep-dark 令牌）；v1 不动工作区外壳 |

## 3. 非目标

- 不重绘侧栏/标签页/状态栏等工作区外壳（Kami Reader 主题的领地）
- 不做 Kami 模板导出（PDF/PPT 交给 Kami 本尊）
- 不做辉光/渐变文字/氛围背景等表演型特效
- 不联网：无遥测、无字体 CDN、无更新检查

## 4. 工程结构

```
D:\Obsidian-Kami\
├─ PLAN.md / GLOSSARY.md / docs/adr/0001-0004.md
├─ manifest.json（id: inkstone, isDesktopOnly: false）
├─ package.json / esbuild.config.mjs / tsconfig.json / eslint.config.mts（obsidianmd recommended）
├─ styles.css（唯一样式文件，分段：令牌/基础排版/组件/动效/reduced-motion）
├─ assets/fonts/（OFL 字体 + LICENSE；优先 woff2，转换不便则 TTF）
└─ src/
   ├─ main.ts            InkstonePlugin 生命周期、命令注册
   ├─ settings.ts        设置面板 + DEFAULT_SETTINGS
   ├─ scope.ts           生效范围管理：全局开关 + frontmatter → 容器类切换
   ├─ mapping.ts         阅读视图 DOM 结构调整（仅 CSS 够不到的部分）
   └─ effects/ reveal.ts / focus.ts / typewriter.ts（呼吸效果纯 CSS）
```

参考仓库（只读，位于项目外）：`D:/Obsidian-Kami-references/obsidian-sample-plugin-master/obsidian-sample-plugin-master/`、`D:/Obsidian-Kami-references/obsidian-releases-master/obsidian-releases-master/`、`D:/Obsidian-Kami-references/eslint-plugin-master/eslint-plugin-master/`。

## 5. 核心机制

- **作用域**：post-processor 读 `ctx.frontmatter`，在渲染根节点挂 `inkstone` / `inkstone-off` / `inkstone-paper` 类；全局开关由设置控制。效果类 JS 只在 `.inkstone` 作用域内激活。
- **排版层**：90% 纯 CSS（Kami 令牌映射到 Obsidian 元素）；mapping.ts 只做 CSS 够不到的结构调整（img alt→题注等）。
- **字体运行时加载**：插件目录内字体经 vault adapter `getResourcePath` 生成 `app://` 地址注入 `@font-face`（卸载时移除），移动端兼容；不可靠时退回 data URI 内嵌。
- **合规硬约束**（eslint-plugin-obsidianmd 规则）：禁 `innerHTML`/静态 style 赋值 → 全部 `createEl` + class；不用全局 `app`；事件 `registerEvent`；UI 文本 Sentence case；`override` 修饰；无默认热键；无 Node/Electron 独占 API；manifest 过 validateManifest；默认零网络请求。

## 6. Kami 令牌移植（源：`D:\Kami\skills\kami\references\design.md` §1-§3）

| 令牌 | 亮色 | 用途 |
|---|---|---|
| parchment | `#f5f4ed` | 页面底 |
| ivory | `#faf9f5` | 安静填充容器 |
| inline-code-bg | `#f0eee6` | 行内代码底 |
| warm-sand | `#e8e6dc` | 按钮/交互面 |
| brand | `#1B365D` | 唯一强调（≤5% 表面） |
| brand-light | `#2D5A8A` | 暗面链接 |
| near-black | `#141413` | 主文字 |
| dark-warm | `#3d3d3a` | 次级文字/链接 |
| olive | `#504e49` | 说明文字 |
| stone | `#6b6a64` | 三级/元数据 |
| border / border-soft / line | `#e8e6dc` / `#e5e3d8` / `#d8d5c8` | 暖色分隔线 |
| tag-bg / brand-tint | `#E4ECF5` / `#EEF2F7` | 标签实底 / 最浅填充 |
| breaking-bg / breaking-fg | `#f0e0d8` / `#8b4513` | 唯一语义警示色 |

暗色（Kami deep-dark 系）：页底 `#141413`、容器 `#1a1917`、强调 `#2D5A8A`、文字阶相应提亮。
灰一律暖调（R≈G>B）；禁纯白页底、冷灰、第二彩色、rgba 标签底、装饰性线条、斜体。

## 7. Markdown→Kami 组件映射（全套）

| Obsidian 元素 | Kami 对应物 |
|---|---|
| h1-h6 | Kami 字号阶梯（屏显 px ≈ pt×1.33，12px 下限），层级靠字号+间距，无装饰线 |
| 正文 | 阅读档 1.55 行高，默认栏宽 700px 可调 |
| blockquote | Kami .quote（olive 色，无边条） |
| table | kami-table（表头 0.6pt / 行 0.25pt 暖线，默认无斑马纹，外列贴文字边） |
| inline code | `#f0eee6` 暖底 |
| code block | ivory 代码卡 + JetBrains Mono，保留 Obsidian 高亮但调成暖色系 |
| #tag | .tag 实底 `#E4ECF5` + brand 字色 |
| callout | 全类型重映射：note/abstract→ivory 卡；info→brand-tint；tip→quiet fill；warning/caution→breaking 双色（唯一语义色）；quote→.quote |
| hr | border-soft 发丝线（只做分隔） |
| img | 8px 圆角 + alt 文本转 stone 色题注 |
| ==mark== | warm-sand 底 + near-black 字 |
| 链接 | dark-warm 色 + hover 下划线生长（呼吸动效） |
| 任务列表 | 极简勾选框，warm-sand 交互底 |

## 8. 动效规格（全部尊重 prefers-reduced-motion）

1. **滚动渐显**：IntersectionObserver，块级淡入 + 8px 上浮，240ms ease-out，进入视口触发一次
2. **交互呼吸**：纯 CSS hover——卡片 1-2px 起伏 + 边线加深、链接下划线 scale-x 生长，150-200ms
3. **聚焦阅读**：视口中带之外的段落退灰至 stone 档，阅读处保持墨色；设置/命令可开关
4. **打字机**：命令触发，逐字显现当前阅读视图，速度设置滑杆（10-120 字/秒，默认 45），点击/Esc 跳过；reduced-motion 自动退化静态

## 9. 设置项

全局开关；纸张样式（暖纸默认 / 白纸打印变体）；暗色下是否生效；字体族覆盖；字号缩放；栏宽（默认 700px）；效果总开关 + 四项独立开关；打字机速度。

## 10. 实施步骤与状态

- [x] 1. 蓝图落盘：PLAN.md（本文件）
- [x] 2. 文书与仓库：GLOSSARY.md、docs/adr/0001-0004、.gitignore、git init + 首提交
- [x] 3. 工程骨架：package.json / esbuild / tsconfig / eslint / manifest / versions / version-bump / 最小 main.ts；`npm i`；验收：`npm run build` + `npm run lint` 全绿
- [x] 4. 排版层：令牌 + styles.css 全套映射 + scope.ts + mapping.ts；验收：构建全绿 + 真实库实测
- [x] 5. 动效层：reveal / focus / typewriter + 呼吸 CSS；验收：构建全绿 + 逐项开关实测
- [x] 6. 设置面板：InkstoneSettingTab 全部设置项 + frontmatter 覆盖生效
- [x] 7. 字体打包：assets/fonts/ 两款 OFL 字体 + LICENSE + @font-face；验证渲染与体积
- [x] 8. 装配：构建产物装入 `spark-cache` 库 `.obsidian/plugins/inkstone/`，铺全要素验收样例笔记
- [x] 9. 收尾：README（中英双语，致谢 tw93/kami）、PLAN 状态更新、git 提交
- [ ] 10. 独立复审 + 修复：全代码对照 PLAN 与审核规范；复审发现逐条修复并复验

## 11. v1.0 验收清单（终点判定）

- [x] `npm run lint` 零错误；`npm run build` 通过
- [ ] 全要素样例笔记：§7 映射逐项核对（含 callout 全类型）
- [ ] 四项动效各开关实测；prefers-reduced-motion 退化生效
- [ ] `inkstone: false` 单篇禁用；全局开关生效
- [ ] 明暗双模式令牌正确
- [ ] 禁用插件后笔记零残留恢复原状
- [ ] 长笔记（300+ 段）滚动不卡；控制台无报错（默认只允许 error 级）
- [x] README 双语、manifest 完整（author 待用户替换 "13757"）

## 12. 文档协议

- PLAN.md 是唯一蓝图：每次继续开发先读它，做完一步勾一步
- 术语变更即时更新 GLOSSARY.md；可逆性差 + 有真实取舍的决策补 ADR
- 安全约束：插件零网络请求；若未来加请求，仅 http/https 且校验 host、拒绝环回/私有/保留地址

## 13. 参考资料

- `D:\Kami\skills\kami\references\design.md`、`CHEATSHEET.md`（设计系统源）
- `D:/Obsidian-Kami-references/obsidian-sample-plugin-master/obsidian-sample-plugin-master/`（工程模板）
- `D:/Obsidian-Kami-references/obsidian-releases-master/obsidian-releases-master/`（审核规范 community-plugins.json）、`D:/Obsidian-Kami-references/eslint-plugin-master/eslint-plugin-master/`（规则源码）
- Kami Reader 主题（社区既有静态移植，互补参照）：github.com/KKenny0/obsidian-kami
- 审核规范：docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
