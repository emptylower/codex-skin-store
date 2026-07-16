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
    platform: "平台",
  },
  preview: {
    home: "首页",
    task: "任务",
  },
  theme: {
    related: "相关主题",
  },
  policy: {
    terms: "服务条款",
    privacy: "隐私政策",
    copyright: "版权声明",
    about: "关于",
  },
} as const satisfies Messages;
