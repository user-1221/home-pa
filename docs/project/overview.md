# HomePA Japan — プロジェクト概要

本書は HomePA Japan の全体像を示す概要ドキュメントです。目的、技術アーキテクチャ、コア機能、セキュリティ、UI/UX 方針、拡張計画を網羅します。

## 目的

日本のユーザーに最適化されたパーソナルアシスタント Web アプリケーションを提供します。日常の予定・タスク・移動（鉄道）を統合し、必要最小限の操作で「次にやること」を提案します。

## 技術アーキテクチャ

### フロントエンド

| 技術            | 用途                               |
| --------------- | ---------------------------------- |
| SvelteKit       | フレームワーク（Svelte 5 / Runes） |
| TypeScript      | 型安全性                           |
| Tailwind CSS v4 | スタイリング                       |
| DaisyUI         | UIコンポーネント                   |
| date-fns        | 日付処理（ja ロケール）            |
| valibot         | スキーマバリデーション             |
| ical.js         | iCalendar 処理（RFC-5545）         |

### バックエンド

| 技術             | 用途                     |
| ---------------- | ------------------------ |
| SvelteKit Server | サーバーランタイム       |
| Prisma           | ORM                      |
| MongoDB 7        | データベース             |
| better-auth      | 認証（HTTP-only Cookie） |
| Remote Functions | 型安全な query/command   |

### AI 統合

| 技術                  | 用途                     |
| --------------------- | ------------------------ |
| Gemini API            | LLM タスク enrichment    |
| @google/generative-ai | SDK                      |
| gemini-2.5-flash-lite | 使用モデル（コスト最適） |

### インフラ

| 技術           | 用途                              |
| -------------- | --------------------------------- |
| Bun            | パッケージマネージャー/ランタイム |
| Docker Compose | 開発環境（MongoDB）               |

## コア機能

### カレンダー管理

- 日本語フォーマット対応
- 終日/時間指定/日付のみイベント
- 繰り返しイベント（RFC-5545 RRULE）
- .ics インポート/エクスポート
- 重要度ごとの色分け

### タスク管理

3種類のタスクタイプ:

| タイプ     | 説明                                       |
| ---------- | ------------------------------------------ |
| 期限付き   | デッドラインあり、締切が近づくと need 上昇 |
| バックログ | 期限なし、放置時間で need 上昇             |
| ルーティン | 繰り返し目標（例: 週3回）                  |

機能:

- LLM による自動 enrichment（ジャンル、重要度、所要時間）
- イベントリンク（カレンダー/時間割と紐付け）

### アシスタント/提案

- ギャップ検出（空き時間の自動検出）
- need/importance スコアリング
- 場所ベースのマッチング
- 有効アクティブ時間の計算

### フォーカス/ポモドーロ

- ポモドーロタイマー
- 柔軟な時間設定
- 進捗インジケーター

### 時間割統合

- 週間時間割の設定
- 休講期間の例外設定
- ギャップ計算への統合

### 交通（計画中）

- NAVITIME API 2.0（仕様書作成済み）
- 経路検索、所要時間計算

## UI/UX 方針

- モダンでミニマル、全面日本語対応
- PC/モバイル両対応、アクセシビリティ配慮
- 重要度を色で直感的に把握できるデザイン
- 「考えさせない」提案（摩擦の少ない操作）

デザイン詳細: [docs/skills/designer.md](../skills/designer.md)

## 今後の拡張

1. 日本の鉄道 API とのリアルタイム連携
2. 天候データを考慮した提案
3. プッシュ通知/リマインド
4. モバイルアプリ（将来検討）
5. 高度な AI（継続学習/個人最適化）

## 関連ドキュメント

- [設計概要](../design.md) - システムアーキテクチャ
- [ロードマップ](roadmap.md) - マイルストーン進捗
- [データフロー](../implementation_guide/DATA_FLOW.md) - 詳細なデータフロー
- [状態管理](../implementation_guide/STATE_MANAGEMENT.md) - Svelte 5 runes パターン
- [繰り返しシステム](../implementation_guide/RECURRENCE.md) - iCal.js 統合
- [時間割](../implementation_guide/TIMETABLE.md) - 時間割システム
- [イベントリンク](../implementation_guide/EVENT_LINKING.md) - タスク-イベント連携
- [LLM 統合](../implementation_guide/LLM_INTEGRATION.md) - Gemini API 統合
