import type { Messages } from "./en";

export const messages = {
  nav: {
    explore: "探索",
    upload: "上传",
  },
  actions: {
    download: "下载",
    copyPrompt: "复制提示词",
  },
  filters: {
    heading: "筛选",
    platform: "平台",
    mode: "外观",
    media: "媒体",
    sort: "排序",
    search: "搜索",
    any: "全部",
    apply: "应用筛选",
    platformMacos: "macOS",
    platformWindows: "Windows",
    platformBoth: "双平台",
    modeLight: "浅色",
    modeDark: "深色",
    mediaStatic: "静态",
    mediaAnimated: "动态",
    sortTrending: "热门",
    sortNewest: "最新",
    sortDownloads: "下载量",
  },
  marketplace: {
    heading: "Codex 主题市场",
    lede: "浏览社区免费的 Codex Desktop 主题。",
    description: "发现并预览免费的 Codex Desktop 主题。",
    simulator: "Codex 模拟器",
    grid: "主题",
    empty: "没有符合这些筛选条件的主题。",
    filterError: "部分筛选值无效，请调整后重试。",
  },
  preview: {
    home: "首页",
    task: "任务",
    tablist: "Codex 视图",
  },
  theme: {
    related: "相关主题",
    by: "作者",
    favorites: "收藏",
    downloads: "下载",
    overview: "概览",
    facts: "主题信息",
    description: "描述",
    compatibility: "兼容性",
    license: "许可",
    licenseFallback: "见安装包",
    version: "版本",
    package: "安装包概览",
    packageStatus: "状态",
    packageReady: "就绪",
    packageKey: "安装包键",
    payloadDigest: "内容摘要",
    archiveDigest: "压缩包摘要",
    palette: "配色",
    focal: "焦点",
    author: "作者",
    installPrerequisites:
      "需要 macOS 或 Windows 上的 Codex Desktop。请使用官方 Codex 安装流程在你的平台上应用主题。",
  },
  creator: {
    themes: "公开主题",
    empty: "该创作者暂无公开主题。",
  },
  taxonomy: {
    themes: "主题",
    empty: "暂无使用该分类的主题。",
  },
  breadcrumbs: {
    home: "首页",
  },
  auth: {
    signIn: "登录",
    profile: "个人资料",
  },
  policy: {
    terms: "服务条款",
    termsBody:
      "Codex Skin Store 是面向 Codex Desktop 的免费社区主题市场。使用本站即表示你承诺仅发布有权发布的内容，尊重其他创作者，并接受出于安全、版权或政策原因的审核与下架。本站不售卖主题安装包。",
    privacy: "隐私政策",
    privacyBody:
      "我们仅处理运营双语公开市场所需的最少数据：主题目录内容、公开创作者资料，以及安全与可靠性所需的技术日志。请勿在主题资源或描述中上传个人敏感信息。如需处理数据相关请求，请联系运营方。",
    copyright: "版权声明",
    copyrightBody:
      "创作者保留其原创主题资源与清单的权利。请勿上传无权使用的材料。可通过站点版权流程提交版权问题。侵权主题可被移除，相关账号可能受到限制。",
    about: "关于",
    aboutBody:
      "Codex Skin Store 帮助用户发现并预览面向 Codex Desktop 的免费社区主题。公开市场支持英语与简体中文，强调透明的主题信息、受控分类与可抓取页面。",
  },
} as const satisfies Messages;
