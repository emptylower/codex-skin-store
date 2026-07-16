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
