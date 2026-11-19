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
   ├─ settings.ts        设置面板 + DEFAULT_SETTINGS（1.13+ 声明式与 <1.13 命令式双路径）
   ├─ i18n.ts            界面文案中英双语字典（设置页 / 下拉项 / 命令名 / Notice）
   ├─ scope.ts           生效范围管理：全局开关 + frontmatter → 容器类切换 + 作用域同步
   ├─ mapping.ts         阅读视图 DOM 结构调整（仅 CSS 够不到的部分）
   └─ effects/ reveal.ts / focus.ts / typewriter.ts（呼吸效果纯 CSS）
```

参考仓库（只读，位于项目外）：`D:/Obsidian-Kami-references/obsidian-sample-plugin-master/obsidian-sample-plugin-master/`、`D:/Obsidian-Kami-references/obsidian-releases-master/obsidian-releases-master/`、`D:/Obsidian-Kami-references/eslint-plugin-master/eslint-plugin-master/`。

## 5. 核心机制

- **作用域**：post-processor 读 `ctx.frontmatter`，在渲染根节点挂 `inkstone` / `inkstone-off` / `inkstone-paper` 类；全局开关由设置控制。效果类 JS 只在 `.inkstone` 作用域内激活。post-processor 依赖渲染调用时刻的 DOM 归属，v1.0.1 起另由 `syncScopeClasses` 按 metadataCache 的 frontmatter 对每个打开视图幂等直挂作用域类（§14 B），不受渲染时序影响。
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
| h1-h6 | em 字号阶梯（display 3.6 / h1 2.2 / h2 1.6 / h3 1.3 / h4 1.1 / label 0.9，基准 = Obsidian 字号 × 倍率，§14 A），层级靠字号+间距，无装饰线 |
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

设置面板分四节（界面 / 纸张 / 排版 / 动效），全部设置项与默认值以 `src/settings.ts` 的 `DEFAULT_SETTINGS` 为准：

| 设置项（中文界面原文） | 默认 | 取值与范围 |
|---|---|---|
| 界面语言 | 自动（跟随 Obsidian） | auto / 中文 / English；auto 按 Obsidian 配置的界面语言（getLanguage）解析，未配置时回退系统语言，非 zh 开头为英文（§14 C） |
| 启用 Inkstone | 开 | 布尔；单篇由 frontmatter 覆盖 |
| 暗色模式下生效 | 开 | 布尔；关闭后暗色主题下不干预 |
| 纸张样式 | 暖纸 | 暖纸（Kami 默认）/ 白纸（打印变体） |
| 字体族 | Kami 衬线 | Kami 衬线 / 无衬线 / 跟随 Obsidian |
| 字号缩放 | 100 | 85–125，步进 5；Obsidian 字号倍率，100 = `--ik-scale: 1` 完全跟随 Obsidian（§14 A） |
| 栏宽 | 700 | 500–1000，步进 10；经 `--file-line-width` 生效，受 Obsidian「可读行宽」开关约束（§14 诊断附注） |
| 启用动效 | 开 | 布尔；关闭后四项独立开关与速度滑杆置灰，只保留静态排版 |
| 滚动渐显 / 交互呼吸 / 聚焦阅读 / 打字机 | 开 / 开 / 关 / 开 | 布尔；总开关关闭时一并停用 |
| 打字机速度 | 45 | 10–120 字/秒，步进 1 |

设置面板双路径渲染：Obsidian 1.13+ 走 `getSettingDefinitions()` 声明式 API（进入全局搜索），<1.13 回退 `display()` 命令式渲染；两条路径共用 `i18n.ts` 的同一套文案。设置页文案随「界面语言」即时切换，命令面板中的命令名在重启 Obsidian 后更新。

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
- [x] 11. v1.0.1 实测反馈修复：A 字号跟随 Obsidian、B 阅读域作用域稳定性、C 界面中英双语、D 版本与文档（manifest/versions → 1.0.1）；验收清单见 §14，装配与人工目检项待后续步骤勾选

## 11. v1.0 验收清单（终点判定）

- [x] `npm run lint` 零错误；`npm run build` 通过
- [ ] 全要素样例笔记：§7 映射逐项核对（含 callout 全类型）
- [ ] 四项动效各开关实测；prefers-reduced-motion 退化生效
- [ ] `inkstone: false` 单篇禁用；全局开关生效
- [ ] 明暗双模式令牌正确
- [ ] 禁用插件后笔记零残留恢复原状
- [ ] 长笔记（300+ 段）滚动不卡；控制台无报错（默认只允许 error 级）
- [x] README 双语、manifest 完整（author 已由占位 "13757" 改为 git 署名 "HUB"，发布前用户可自行改定）
- [ ] PDF 导出复核：导出走 print 媒体查询，渐显/打字机隐藏态强制呈现，无半透明空白块（复审第 1 轮 §4）
- [ ] 发布前向审核确认 manifest name 用非 ASCII 品牌名 "Inkstone 纸研"（ADR-0004；社区 10555 个插件 name 均为 ASCII，复审第 1 轮 §12）

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

## 14. v1.0.1 实测反馈修复（2026-11-19 立项，方案经 grill 三轮收敛）

用户装入验收库（spark-cache）实测反馈两类问题：①阅读视图字体不稳定——部分笔记（2026-11-16）完全无效果、部分（2026-11-15）生效但正文偏小，编辑/源码模式始终稳定，切模式/重开标签不恢复；②设置页全英文。

### 根因（代码定位）

- **不稳定是结构性的**：阅读域排版全依赖 post-processor 渲染时挂 `.inkstone` 作用域类（src/scope.ts:144-162）。插件加载前已渲染的视图、`RENDER_ROOT_SELECTOR` 未匹配的容器永远漏挂；main.ts:112 首次加载跳过重渲染。实测库 data.json 为空（全默认值），暗色门控已排除。
- **偏小是阶梯设计**：阅读域挂 Kami 印刷 px 字号阶梯（正文 13px），Live Preview 共享层只改字体族不改字号（styles.css:555）→ 编辑 16px / 阅读 13px。

### 已确认决策

- 字号完全跟随 Obsidian 规则（不自创阶梯）；「字号缩放」保留为 Obsidian 字号倍率（100% = 完全跟随）。
- 界面语言默认跟随 Obsidian 界面语言（getLanguage；未配置时回退系统），可手动 auto/中文/English。
- 三项一起出 v1.0.1。

### 改动项

- [x] **A. 字号跟随 Obsidian**（styles.css）：删除 Kami px 字号阶梯定义及全部 font-size 覆盖，阅读域继承 `--font-text-size` + em 阶梯；保留字体族/颜色/字重 500/行高/字距/间距/背景/栏宽；`--ik-scale` 作为倍率统一作用于阅读域渲染根与 LP `.cm-content`（`calc(var(--font-text-size) * var(--ik-scale))`），两模式同步缩放
- [x] **B. 阅读域作用域稳定性**（scope.ts + main.ts）：实施首步先在验收库钉死漏挂路径（渲染根 DOM 诊断，结论补记本节）；新增 `syncScopeClasses`（metadataCache frontmatter → 复用 resolve/applyScopeClasses 幂等直挂，选择器扩 `.markdown-reading-view`），onload / active-leaf-change / layout-change / css-change 触发（去抖 ~100ms）；移除首跳守卫，首次加载也重渲染阅读视图
- [x] **C. 中英双语**（settings.ts + effects）：新增 `language` 设置（auto/zh/en）+ LABEL/DESC 双语字典 + `t()` 取词；下拉选项 addOptions 本地化显示名；覆盖设置页全部文案、命令名（打字机）、Notice
- [x] **D. 文档与版本**：本节随实施勾选；§9 同步；manifest/versions → 1.0.1

### v1.0.1 验收清单

（第 1 项已于复审第 1 轮修复时完成：lint/build 全绿，产物装配 spark-cache 验收库且 md5 逐文件一致；其余各项为人工目检，仍需实测步骤勾选。）

- [x] `npm run lint` + `npm run build` 全绿；产物装配 spark-cache 验收库（md5 逐文件比对）
- [ ] 2026-11-15 / 2026-11-16 阅读视图均生效；阅读与编辑模式字号一致；切标签、重开 Obsidian 立即正确
- [ ] `inkstone: false` 单篇禁用零残留；暗色门控行为不回归
- [ ] auto 档中文系统显示中文；手动切 English 设置页即时变英文
- [ ] 缩放 100% 与 Obsidian 原生字号一致；非 100% 两模式同步缩放
- [ ] 明暗两主题各验一遍

### 诊断结论（v1.0.1 实施首步）

**实测事实（2026-11-19，spark-cache；Obsidian 1.15.0，取自 `resources/obsidian.asar/package.json`）**

- 装配目录 `.obsidian/plugins/inkstone/`：`main.js`（03:21）、`styles.css`（03:09）、`manifest.json`（version 0.1.0）、`fonts/`；**无 data.json**（`cat` 报 No such file），行为等价全默认值（settings.ts:163-179）。仓库与装配的 main.js/styles.css md5 一致（35517b57…/017e1f68…），实测对象即当前构建。
- `.obsidian/` 无 `themes/`、无 `snippets/`；`appearance.json` 仅 `theme: system`（无 cssTheme / enabledCssSnippets）；`app.json`：`defaultViewMode: preview`、`readableLineLength: false`。
- `journal/2026/11/2026-11-15.md` 与 `2026-11-16.md` frontmatter 同构（date/describe/thoughts），均无 `inkstone` / `inkstone-paper` / `cssclasses`；全库仅「Inkstone 验收/关闭样例.md」有 `inkstone: false`。两篇差异不能由 frontmatter 解释。
- workspace 快照三页：2026-11-15（active）、2026-11-17、2026-11-16，无显式 mode → 走 preview。

**漏挂主因（新证据，细化本节「根因」）**

Obsidian 1.15.0 阅读视图按 section 分片渲染：section 的 `el` 由 `createDiv()` 创建（游离），`onRender()` 先 `f.render()` → `this.owner.postProcess(f,…)`，之后才 `setChildrenInPlace` 上树，而 `postProcess` 传入的正是 `el: e.el`。因此 post-processor 运行时 `el.closest(...)` 只看得到 section 子树：`src/scope.ts:148` 得 `null`，`scope.ts:149` 直接 return，`.inkstone` 从未挂上；同一原因使 reveal.ts:53 / focus.ts:52 也永不生效。

- `RENDER_ROOT_SELECTOR`（scope.ts:31）首项 `.markdown-reading-view-content` 在 obsidian.asar 中 0 次出现（幻影类）；实际 DOM 链为 `.markdown-reading-view > .markdown-preview-view.markdown-rendered > .markdown-preview-sizer.markdown-preview-section > div`，嵌入为 `.markdown-embed > .markdown-embed-content > .markdown-preview-view`。
- 只有「section 在 post-processor 之前已挂在 DOM 上」时才命中（例如插件重载 → `post-processor-change` → `rerender(!0)`，asar 证据）；此后新建/首次渲染的标签页命中不到，这是逐篇不一致的来源。
- main.ts:112 首跳守卫使首次 `refreshRuntime()` 不重渲染；main.ts:72 的 `layout-change` 走同一守卫，切模式不修复。post-processor 对已渲染 section 不再重跑（`if(f.rendered)continue`），切回阅读模式也不补类。
- 旧包 `?? el` 回退（232d5a3 之前的 scope.ts:111）会把类挂到 section 自身，旧状态可能残留半套样式；装配包已是移除后的版本（bundle grep 证实）。此项属推断，待运行时复核。

**判定**：2026-11-16「完全无效果」= 该页在插件注册之后才首次渲染 → section 游离 → 根无类；切模式复用同一阅读 DOM → 不恢复。2026-11-15「生效但偏小」= 其根在某个「已挂载 section」批次上拿到 `.inkstone`，命中阅读档 13px（styles.css:86、212-218），而 LP 只改字体族不改字号（styles.css:555-558）→ 16px 对 13px。逐篇差异是渲染时序竞态，不是笔记属性。

**B 项实施须覆盖**

- `syncScopeClasses` 挂载：逐 markdown leaf 对 `.markdown-reading-view` 与 `.markdown-preview-view` 成对幂等 toggle（`.markdown-reading-view` 持久存在，MarkdownView 构造即建）；不全文盲扫 `.markdown-preview-view`（会污染 hover 预览/嵌入）。
- 触发：`onload`、`workspace.onLayoutReady`、`active-leaf-change`、`layout-change`、`file-open`、`css-change`、`window-open`、`metadataCache.on('changed')`，去抖 ~100ms。
- 其他必改点：scope.ts:31（去幻影类、补 `.markdown-reading-view`）；scope.ts:144-162（游离 el 需延后重跑，或 mapping/动效改由同步后的根驱动）；reveal.ts:49-55、focus.ts:48-54、typewriter.ts:44-48；main.ts:112（首跳守卫）；styles.css:135-153（`.inkstone` 背景被 `.workspace-leaf-content.is-read-mode .markdown-preview-view{background-color:var(--background-primary)}` 以 0,3,0 特异性压过，需提高特异性或改写 `--background-primary`）。
- 附注：本库 `readableLineLength: false` → 无 `.is-readable-line-width` → `--file-line-width` 不生效，栏宽设置在阅读视图无效。
