# Inkstone Paper（纸研）

自带 Kami 排版层与克制动效的 Obsidian 插件：把 tw93/kami 设计系统的纸感排版移植进阅读视图，暖纸底、油墨蓝作为唯一强调色、衬线承载层级，再叠一层只服务信息的微动效。排版层由插件自持，不依赖任何主题。

插件 id `inkstone`，社区目录显示名 `Inkstone Paper`（中文名「纸研」），当前版本 1.0.1，最低要求 Obsidian 1.5.0。

v1.0.1 已装配到验收库 spark-cache 的 `.obsidian/plugins/inkstone/`，重启 Obsidian 后生效。

## 功能概览

**Kami 排版层**（阅读模式完整生效）

- 全套 markdown 组件映射：标题字号阶梯、正文 1.55 行高与默认 700px 版心、引用（olive 色无边条）、表格暖色发丝线、行内代码暖底、ivory 代码卡、实底标签、callout 全类型重映射、发丝分隔线、图片 8px 圆角加 alt 题注、`==高亮==`、极简任务列表勾选框
- callout 分组：note/abstract 与 question 族呈 ivory 卡，info/tip/success 族呈 brand-tint 浅蓝底，warning/caution/danger 族呈 breaking 双色（唯一语义警示），quote/cite 归入引用样式
- 油墨蓝是唯一强调色；亮暗两套令牌（暗色为 Kami deep-dark 系），另有白纸打印变体
- 打包两款 OFL 字体：霞鹜文楷屏幕版（LXGW WenKai Screen）+ JetBrains Mono，文件缺失时回退本机字体栈

**四项微动效**（仅阅读模式，规格见下文）

- 滚动渐显、交互呼吸、聚焦阅读、打字机；全部尊重系统的"减少动态"（prefers-reduced-motion）偏好

**其他**

- frontmatter 单篇覆盖：`inkstone: false` 关、`inkstone: true` 强制开、`inkstone-paper` 覆盖纸张样式
- Live Preview 只共享排版令牌与基础排版，无动效
- 零网络请求：无遥测、无字体 CDN、无更新检查
- 卸载零残留：作用域类、观察器、临时 DOM 全部清理，笔记恢复 Obsidian 原状

## 字号跟随 Obsidian

插件不自建 px 字号阶梯。阅读视图与 Live Preview 的正文基准统一为 `calc(var(--font-text-size) * var(--ik-scale))`，即 Obsidian 外观设置中的字体大小乘以插件的字号倍率。字号缩放为 100% 时，阅读与编辑视图都等于你为 Obsidian 设定的字号；在 85% 至 125% 之间调整时，两种模式同步缩放，标题与正文的比例靠 em 阶梯保持不变。字体族、字重、行高、字距、颜色与栏宽仍由 Kami 排版层控制。

## 界面语言

设置项「界面语言」支持自动（跟随 Obsidian 界面语言，未设置时回退系统）/ 中文 / English，默认自动：Obsidian 界面语言以 `zh` 开头显示中文，其余显示英文。设置页与提示消息即时切换；命令面板中的「播放打字机效果 / Play typewriter effect」在重启 Obsidian 后按新语言更新。

## 安装

### 手动安装

1. 从 Release 下载压缩包，或自行构建（`npm install && npm run build`），得到四个成员：`main.js`、`styles.css`、`manifest.json`、`fonts/` 目录（构建脚本自动从 `assets/fonts/` 拷出 `fonts/`）。
2. 在库中打开 `.obsidian/plugins/`，新建 `inkstone` 文件夹，把四个成员完整复制进去：

   ```
   <你的库>/.obsidian/plugins/inkstone/
   ├─ main.js
   ├─ manifest.json
   ├─ styles.css
   └─ fonts/          （约 25 MB；缺失时不影响启用，但会失去 Kami 字体）
   ```

3. 重启 Obsidian，设置 → 第三方插件 → 启用 Inkstone Paper。

### 通过 BRAT

插件发布到公开 GitHub 仓库后可用 BRAT 安装：安装并启用 BRAT → 命令面板执行 `BRAT: Add a beta plugin for testing` → 输入仓库地址（如 `https://github.com/<你的用户名>/inkstone`）→ 启用 Inkstone。请确认发布产物包含 `fonts/` 目录，否则请改用手动安装以获得完整字体。

## 生效范围

- **阅读模式**：排版层与四项动效完整生效。
- **Live Preview**：只共享排版令牌与基础排版，无动效。
- 排版与动效只作用于生效作用域内的渲染容器；全局开关给出默认，frontmatter 给出单篇例外。

## frontmatter 覆盖

单篇关闭（优先级最高，压过一切设置）：

```yaml
---
inkstone: false
---
```

强制开启与纸张覆盖（可与全局设置相反）：

```yaml
---
inkstone: true          # 全局关闭或暗色下停用时，本篇仍开启
inkstone-paper: false   # 本篇用暖纸，覆盖全局的白纸设置；写 true 则本篇用白纸
---
```

规则：`inkstone: false` 压过一切（阅读与编辑视图同时停用）；`inkstone: true` 压过全局开关与暗色门控（阅读与编辑视图同时开启）；`inkstone-paper` 双向覆盖全局纸张样式（仅阅读视图）。字符串形式的 `"true"`/`"false"` 同样接受。

## 设置项

| 设置项（界面原文） | 默认 | 说明 |
| --- | --- | --- |
| Interface language | Auto (follow Obsidian) | 自动跟随 Obsidian 界面语言（未设置时回退系统），或手动选 中文 / English；设置页即时切换，命令名重启后更新 |
| Enable Inkstone | 开 | 全局总开关；关闭后插件不做排版干预，frontmatter `inkstone: true` 仍可单篇开启 |
| Active in dark mode | 开 | 暗色主题下是否生效；frontmatter 显式表达优先于本项 |
| Paper style | Warm paper | 暖纸（Kami 默认）或白纸打印变体 |
| Font family | Kami serif | 衬线（打包霞鹜文楷屏幕版）/ Sans-serif 无衬线 / Follow Obsidian 跟随外观字体 |
| Font size scale | 100 | 85 至 125，步进 5；Obsidian 字号倍率，100 = 完全跟随 Obsidian |
| Column width | 700 | 500 至 1000px，步进 10，正文版心宽度 |
| Enable effects | 开 | 动效总开关；关闭后四项动效全部停用，保留静态排版 |
| Scrolling reveal | 开 | 滚动渐显独立开关 |
| Interactive breathing | 开 | 交互呼吸独立开关 |
| Focus reading | 关 | 聚焦阅读独立开关；它改变常态阅读外观，属显式选择的阅读状态 |
| Typewriter | 开 | 打字机独立开关；关闭后命令从命令面板消失 |
| Typewriter speed | 45 | 打字机速度，10 至 120 字/秒 |

## 四项动效

1. **滚动渐显（Scrolling reveal）**：IntersectionObserver 驱动，块级淡入加 8px 上浮，240ms ease-out，进入视口触发一次，不回退。仅阅读模式。
2. **交互呼吸（Interactive breathing）**：纯 CSS hover 反馈。卡片轻微起伏、边线加深；链接下划线自左向右生长。时长 150 至 200ms，无 JS 参与。
3. **聚焦阅读（Focus reading）**：视口上下各收 30% 的中带之外，段落退灰至 stone 色阶；带内保持墨色，引导视线。仅阅读模式，默认关闭。当前版本只经设置开关（未提供命令）。
4. **打字机（Typewriter）**：命令面板执行 `Play typewriter effect`，当前阅读视图内容逐字显现；点击或 Esc 跳过，结束后 DOM 完整还原。速度即设置项的 10 至 120 字/秒。无默认热键。

系统开启"减少动态"时，三项 JS 动效不启动，CSS 兜底关闭全部过渡，打字机命令在命令面板中不可见。

## v1.0 已知边界

- 不动工作区外壳：侧栏、标签页、状态栏、编辑器外壳保持 Obsidian 原样。那是 Kami Reader 主题的领地，本插件与之互补。
- 动效仅阅读模式；Live Preview 只共享令牌与基础排版。
- 不做 Kami 模板导出（PDF、PPT 交给 Kami 本尊）；无辉光、渐变文字、氛围背景等表演型特效。
- 移动端未实测（代码保持 `isDesktopOnly: false` 的兼容约束）。
- 长笔记滚动性能未做量化测量。

## 变更记录

### 1.0.1（2026-11-19）

- **字号跟随 Obsidian**：删除自建 px 字号阶梯，阅读与编辑视图共用 Obsidian 字号基准；「字号缩放」改为倍率，100% 即完全跟随
- **阅读视图稳定性**：新增作用域同步，插件加载前已渲染的笔记、新建标签页、切回阅读模式都会立即补上作用域类，不再逐篇失效
- **界面中英双语**：新增「界面语言」（自动 / 中文 / English）
- **版本与文档**：manifest 与 versions.json 升至 1.0.1，README、PLAN、GLOSSARY 同步

### 0.1.0

首个版本：Kami 排版层、四项微动效、frontmatter 单篇覆盖、打包 OFL 字体。

## 许可证

本插件代码以 [MIT](https://opensource.org/licenses/MIT) 许可发布。

## 致谢与出处

- **设计系统 [tw93/Kami](https://github.com/tw93/Kami)**（MIT）：排版令牌、组件形态与克制哲学的全部出处。Inkstone 是其非官方衍生，与 Kami 本尊相互独立。社区主题 [Kami Reader（KKenny0/obsidian-kami）](https://github.com/KKenny0/obsidian-kami)是另一份静态移植，同样值得致意。
- **字体**：
  - [霞鹜文楷屏幕版 LXGW WenKai Screen](https://github.com/lxgw/LxgwWenKai-Screen)，SIL Open Font License 1.1（含作者附加授权说明），许可全文见 `fonts/OFL.txt`；
  - [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono)，SIL Open Font License 1.1，许可全文见 `fonts/LICENSE.txt`。

---

## English (short)

**Inkstone Paper** (Chinese: 纸研) is an Obsidian plugin that bundles a Kami typesetting layer with restrained micro-motion. It ports the tw93/kami design system (warm paper, single ink-blue accent, serif hierarchy) into the reading view, plus four subtle effects. Works without any theme; complements the Kami Reader theme.

**Features**: full markdown component mapping (headings, tables, callouts, tags, code, images, task lists); light/dark token sets with a white-paper variant; bundled OFL fonts (LXGW WenKai Screen + JetBrains Mono); per-note frontmatter overrides; zero network requests; clean uninstall.

**Effects** (reading mode only, all respect `prefers-reduced-motion`): scrolling reveal (fade + 8px rise, 240ms, once per block); interactive breathing (CSS hover lift and underline growth, 150-200ms); focus reading (paragraphs outside the viewport's middle band dim, off by default); typewriter (command `Play typewriter effect`, 10-120 chars/s, click or Esc to skip).

**Font size follows Obsidian**: the plugin defines no px type ladder of its own. Body text in both reading view and Live Preview is `calc(var(--font-text-size) * var(--ik-scale))`, your Obsidian font size times the plugin scale. At 100% both modes match the size set in Obsidian; 85-125% scales them together, with heading ratios kept by an em ladder.

**Interface language**: auto (follow the Obsidian interface language, falling back to the system) / 中文 / English, auto by default (a `zh` interface gives Chinese, otherwise English). The settings page and notices switch instantly; command names update after restarting Obsidian.

**Install**: copy `main.js`, `styles.css`, `manifest.json` and the `fonts/` folder into `<vault>/.obsidian/plugins/inkstone/`, then enable it in Community plugins. BRAT works once the plugin is published to a public GitHub repository.

**Frontmatter**: `inkstone: false` disables per note (highest priority); `inkstone: true` forces it on; `inkstone-paper: true/false` overrides the paper style per note.

**Changelog**: 1.0.1 — font size follows Obsidian (the scale becomes a multiplier, 100% = unchanged); scope classes are synced to every open reading view so no note is skipped; bilingual interface (auto / Chinese / English); version bumped to 1.0.1.

**Known limits (v1.0)**: the workspace shell (sidebars, tabs, status bar) is left untouched; effects are reading-mode only while Live Preview shares tokens and basic typesetting; mobile is untested.

**License**: MIT. Design system credits go to tw93/Kami (MIT); this plugin is an unofficial derivative. Fonts are under the SIL Open Font License 1.1.
