import type { DriveStep } from "$lib/features/shared/tour/tour-driver.ts";

export const tasksTourSteps: DriveStep[] = [
  {
    element: '[data-tour="tasks-create-task"]',
    popover: {
      title: "タスクを作成",
      description:
        "ここから新しいタスクを作成できます。期限付き・バックログ・ルーティンの3種類があります。",
      side: "left",
      align: "center",
    },
  },
  {
    element: '[data-tour="tasks-list"]',
    popover: {
      title: "タスク一覧",
      description:
        "タスクカードには進捗や期限が表示されます。タップして編集、左スワイプでアクションが出ます。",
      side: "top",
      align: "center",
    },
  },
  {
    element: '[data-tour="tasks-filter-tabs"]',
    popover: {
      title: "フィルター",
      description: "アクティブなタスクとレポートを切り替えられます。",
      side: "bottom",
      align: "center",
    },
  },
];
