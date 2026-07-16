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
  },
  policy: {
    terms: "服务条款",
    privacy: "隐私政策",
    copyright: "版权声明",
    about: "关于",
  },
} as const satisfies Messages;
