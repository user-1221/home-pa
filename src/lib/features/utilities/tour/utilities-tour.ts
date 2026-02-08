import type { DriveStep } from "$lib/features/shared/tour/tour-driver.ts";

export const utilitiesTourSteps: DriveStep[] = [
  {
    element: '[data-tour="utilities-grid"]',
    popover: {
      title: "ミニアプリ",
      description: "ミニアプリ集です。タップして使えます。",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="utilities-settings"]',
    popover: {
      title: "設定",
      description:
        "アプリの設定はここからアクセスできます。プロフィールの編集もここから行えます。",
      side: "bottom",
      align: "end",
    },
  },
];
