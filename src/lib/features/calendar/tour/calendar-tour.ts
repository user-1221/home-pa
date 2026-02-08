import type { DriveStep } from "$lib/features/shared/tour/tour-driver.ts";

export const calendarTourSteps: DriveStep[] = [
  {
    element: '[data-tour="calendar-grid"]',
    popover: {
      title: "カレンダー",
      description:
        "月表示のカレンダーです。日付をタップすると、その日の詳細が見れます。",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="calendar-create-event"]',
    popover: {
      title: "予定を作成",
      description: "ここから新しい予定を作成できます。",
      side: "left",
      align: "center",
    },
  },
  {
    element: '[data-tour="calendar-filter-toggle"]',
    popover: {
      title: "フィルター",
      description: "カレンダーの表示フィルターやGoogle連携の設定ができます。",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="calendar-timetable"]',
    popover: {
      title: "時間割",
      description: "時間割の設定・表示ができます。",
      side: "bottom",
      align: "center",
    },
  },
];
