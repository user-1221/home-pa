import type { DriveStep } from "$lib/features/shared/tour/tour-driver.ts";

export const assistantTourSteps: DriveStep[] = [
  {
    popover: {
      title: "アシスタント",
      description:
        "アシスタントは、あなたの空き時間にタスクの提案をします。予定とタスクを元に、最適な時間を見つけます。",
    },
  },
  {
    element: '[data-tour="assistant-timeline"]',
    popover: {
      title: "タイムライン",
      description:
        "今日のスケジュールが円形で表示されます。予定・空き時間・提案が色分けされています。",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="assistant-events-card"]',
    popover: {
      title: "今日の予定",
      description:
        "今日の予定一覧です。「どこかのタイミングで」のアイテムもここに表示されます。",
      side: "top",
      align: "center",
    },
  },
];
