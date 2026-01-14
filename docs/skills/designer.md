# Design System

HomePA デザインガイド。

## Quick Reference

### Tech Stack

- **Tailwind CSS v4** + **DaisyUI v5**
- **Mobile-first** (breakpoint: 768px)
- **Font**: Source Code Pro

### DaisyUI Theme Configuration

**Important:** DaisyUI's default "light" theme uses blue as primary. HomePA overrides this with custom colors via `@plugin "daisyui/theme"` in `src/app.css`.

When using DaisyUI components (e.g., from MCP or docs), they will show default blue colors. The actual app uses Neptune teal (`#7BBEBB`) as primary.

```css
/* src/app.css - Theme override */
@plugin "daisyui/theme" {
  name: "light";
  default: true;
  --color-primary: #7bbebb; /* Neptune, not blue */
  --color-secondary: #cee3d3; /* Surf Crest */
  --color-success: #2ab388; /* Jungle Green */
  /* ... */
}
```

DaisyUI classes like `bg-primary`, `btn-primary`, `text-primary` will use these custom colors in the app.

### Core Colors

| Name                   | HEX       | Usage                                    |
| ---------------------- | --------- | ---------------------------------------- |
| Neptune (Primary)      | `#7BBEBB` | 選択状態、今日、プライマリボタン         |
| Surf Crest (Surface)   | `#CEE3D3` | ホバー、範囲プレビュー、セカンダリパネル |
| Jungle Green (Success) | `#2AB388` | 成功、確認、ポジティブ                   |
| Error                  | `#DC2626` | エラー、競合                             |

### Key Values

| Property             | Value              |
| -------------------- | ------------------ |
| Base spacing         | 8px                |
| Touch target         | 44px min           |
| Border radius (card) | 12px               |
| Bottom nav height    | 80px               |
| Transition           | 200-300ms ease-out |

---

## 1. Design Principles

### Concept: 「静かな知性」

ユーザー向けパーソナルアシスタント。次にやることを「考えさせない」提案。

### Core Principles

| Principle                   | Description                          |
| --------------------------- | ------------------------------------ |
| Content-first               | デザインは可読性に奉仕し、主張しない |
| Restraint builds trust      | 装飾が少ない = プロフェッショナル    |
| Progressive disclosure      | 情報密度を段階的に開示               |
| Motion serves clarity       | アニメーションは明確化のため         |
| Consistency over creativity | 一貫したパターンで「考えずに使える」 |

### Tone

- **Calm & Intelligent**: 騒がしくない、でも頼れる
- **Zen Minimalism**: 余白を恐れない、引き算の美学
- **Warm Neutrality**: 冷たすぎないニュートラル

### Avoid (NEVER)

- Generic fonts (Inter, Roboto, Arial そのまま)
- AI感光沢グラデーション
- ダッシュボード的情報過多
- ゲーミフィケーション的過剰演出

---

## 2. Color System

### 2.1 Brand Colors (3)

#### Primary — Neptune `#7BBEBB`

選択状態、今日のインジケーター、プライマリボタン、フォーカスリング

| Shade | HEX       | Usage          |
| ----- | --------- | -------------- |
| 100   | `#E6F3F2` | 選択背景       |
| 400   | `#9ED1CF` | hover          |
| 600   | `#7BBEBB` | default        |
| 800   | `#4E8F8C` | active/pressed |

#### Surface — Surf Crest `#CEE3D3`

ホバー行、範囲プレビュー、セカンダリパネル、ソフト強調

| Shade | HEX       | Usage              |
| ----- | --------- | ------------------ |
| 50    | `#F4FAF6` | subtle background  |
| 100   | `#CEE3D3` | default tint       |
| 200   | `#B6D6C1` | stronger highlight |

#### Success — Jungle Green `#2AB388`

可用性、確認状態、成功フィードバック、ポジティブバッジ

| Shade | HEX       | Usage      |
| ----- | --------- | ---------- |
| 100   | `#E6F7F1` | background |
| 500   | `#2AB388` | default    |
| 700   | `#1E8A69` | dark       |

### 2.2 Neutral Colors

#### Backgrounds

| Name            | HEX       |
| --------------- | --------- |
| App background  | `#FFFFFF` |
| Surface (cards) | `#F6F7F8` |
| Calendar grid   | `#FAFAFA` |

#### Text

| Name           | HEX       |
| -------------- | --------- |
| Primary        | `#1F2937` |
| Secondary      | `#6B7280` |
| Muted/disabled | `#9CA3AF` |

#### Borders

| Name           | HEX       |
| -------------- | --------- |
| Default        | `#E5E7EB` |
| Strong divider | `#D1D5DB` |

### 2.3 Semantic Colors

| Type    | Default   | Light     |
| ------- | --------- | --------- |
| Error   | `#DC2626` | `#FEE2E2` |
| Warning | `#F59E0B` | `#FEF3C7` |

### 2.4 Interaction States

| State    | Style                                  |
| -------- | -------------------------------------- |
| Hover    | +8-12% brightness or Primary 400       |
| Active   | Primary 800                            |
| Focus    | 2px outline, Primary 600 @ 60% opacity |
| Disabled | Neutral text + 40% opacity             |

### 2.5 Event Colors

イベント色はカテゴリー分類用（ユーザーカスタマイズ可能）。

**Rules:**

- UI クロームより高い彩度
- Neptune、Surf Crest、Jungle Green を再利用しない
- UI はイベント色なしで読みやすくあるべき

### 2.6 Contrast & Readability

WCAG AA requires 4.5:1 for normal text, 3:1 for large text (18px+ or 14px bold).

#### Recommended Text/Background Pairings

| Background                | Text Color                 | Contrast | Use Case                          |
| ------------------------- | -------------------------- | -------- | --------------------------------- |
| `#FFFFFF` (white)         | `#1F2937` (primary text)   | 14.7:1   | Body text, headings               |
| `#FFFFFF`                 | `#6B7280` (secondary text) | 5.0:1    | Descriptions, meta                |
| `#FFFFFF`                 | `#9CA3AF` (muted text)     | 3.5:1    | Disabled, hints (large text only) |
| `#F6F7F8` (base-200)      | `#1F2937`                  | 13.5:1   | Card content                      |
| `#F6F7F8`                 | `#6B7280`                  | 4.6:1    | Card secondary text               |
| `#7BBEBB` (Neptune)       | `#FFFFFF`                  | 2.5:1    | Buttons (use bold/large text)     |
| `#7BBEBB`                 | `#1F2937`                  | 5.8:1    | Better for small text on Neptune  |
| `#2AB388` (Jungle Green)  | `#FFFFFF`                  | 3.2:1    | Success buttons (bold/large)      |
| `#DC2626` (Error)         | `#FFFFFF`                  | 4.6:1    | Error buttons, badges             |
| `#E6F3F2` (Neptune 100)   | `#4E8F8C` (Neptune 800)    | 4.8:1    | Selected state text               |
| `#FEE2E2` (Error light)   | `#DC2626`                  | 4.5:1    | Error message text                |
| `#FEF3C7` (Warning light) | `#92400E` (amber-800)      | 5.2:1    | Warning message text              |

#### Badge/Tag Pairings

| Badge Background | Text Color                   | Example               |
| ---------------- | ---------------------------- | --------------------- |
| `bg-primary/10`  | `text-primary` (Neptune 600) | Routine period labels |
| `bg-base-200/80` | `text-base-content/70`       | Genre tags            |
| `bg-base-200/60` | `text-base-content/60`       | Location, duration    |
| `bg-info/10`     | `text-info`                  | Event link badge      |
| `bg-success/10`  | `text-success`               | Positive indicators   |
| `bg-error/10`    | `text-error`                 | Error/conflict badges |

#### Opacity Guidelines

| Opacity         | Usage                      | Notes                              |
| --------------- | -------------------------- | ---------------------------------- |
| `/70`           | Secondary readable text    | Good contrast on light backgrounds |
| `/60`           | Tertiary text, meta labels | Minimum for small text (12px)      |
| `/50`           | Placeholders, icons, hints | Only for 14px+ or non-essential    |
| `/40` and below | **Avoid**                  | Too low contrast for most uses     |

#### Guidelines

1. **Primary buttons (Neptune)**: Use white text with `font-medium` or larger size (16px+) to compensate for lower contrast ratio
2. **Light backgrounds with brand colors**: Prefer darker shades (600-800) for text
3. **Muted text (`#9CA3AF`)**: Only for large text or non-essential info
4. **Semantic light backgrounds**: Pair with their dark counterpart (e.g., `#FEE2E2` + `#DC2626`)
5. **Opacity overlays**: When using `/10`, `/20` backgrounds, use full-opacity text of the same hue

---

## 3. Typography

### Font Family

| Type     | Font            |
| -------- | --------------- |
| Primary  | Source Code Pro |
| Fallback | Inter           |

### Font Weight

| Weight   | Value | Usage                  |
| -------- | ----- | ---------------------- |
| Light    | 100   | ディスプレイ、大見出し |
| Normal   | 400   | 本文、デフォルト       |
| Medium   | 500   | 見出し、強調           |
| Semibold | 600   | 強い強調、時刻         |

### Font Size Scale

| Size    | Line Height | Usage                              |
| ------- | ----------- | ---------------------------------- |
| 10px    | +3px        | 補助テキストのみ（下記参照）       |
| 12px    | +3px        | ラベル、キャプション、タグ、バッジ |
| 13-14px | +4px        | 本文、説明、サブタイトル           |
| 16-18px | +4-5px      | 見出し、セクションタイトル         |
| 20-24px | +6px        | ページタイトル、大見出し           |
| 32px    | +8px        | ディスプレイ数値                   |

### Minimum Font Size (Tiered Approach)

| Tier          | Min Size | Tailwind      | Allowed Usage                                              |
| ------------- | -------- | ------------- | ---------------------------------------------------------- |
| Primary       | 12px     | `text-xs`     | すべての読むべきテキスト（タイトル、ラベル、バッジ、説明） |
| Supplementary | 10px     | `text-[10px]` | 大きな数値に隣接する単位/補助のみ                          |

#### 10px が許可されるケース

10px (`text-[10px]`) は以下の条件を**すべて**満たす場合のみ使用可:

1. **隣接する大きなテキストがある** - 単独で意味を持たない
2. **補助的な役割** - 単位（"min", "日", "pt"）や文脈ヒント（"あと", "残り"）
3. **読めなくても機能する** - 主要情報は別のテキストで伝わる

**許可例:**

```
┌─────────────────┐
│  15/30          │  ← text-sm (14px) - 主要情報
│   min           │  ← text-[10px] OK - 単位、補助的
└─────────────────┘

┌─────────────────┐
│  あと           │  ← text-[10px] OK - 補助的
│   3日           │  ← text-base (16px) - 主要情報
└─────────────────┘
```

**禁止例:**

```
❌ text-[10px] で "時間割" ラベル → 単独で意味を持つ、12px必須
❌ text-[10px] で "出発" / "到着" → 単独で意味を持つ、12px必須
❌ text-[10px] で バッジテキスト → 読むべきテキスト、12px必須
```

### Text Alignment

| Alignment | Usage                                |
| --------- | ------------------------------------ |
| Left      | デフォルト（ほとんどのコンテンツ）   |
| Center    | 日付表示、数値、中央寄せヘッドライン |
| Right     | タイムスタンプ、期日、メタデータ     |

### Typography Rules

- 最小サイズ: 12px
- 見出しは `font-normal` を優先（軽い印象）
- 階層は weight より size と spacing で作る
- Letter spacing: `-0.04em`（メタデータ）, `0.08em`（大文字ラベル）

---

## 4. Spacing

### Base Unit

- **Base**: 8px（すべてのスペーシングは 8px の倍数）
- **Fine adjustment**: 2px

### Spacing Scale

| Value   | Usage                                        |
| ------- | -------------------------------------------- |
| 4-6px   | タイトな spacing、アイコン padding、タグ内部 |
| 8-10px  | 標準コンテンツ gap、フォームフィールド       |
| 12-16px | セクション spacing、カードコンテンツ         |
| 18-24px | カード padding、主要セクション               |
| 32-48px | 大きなマージン、レイアウト gap               |

### Padding Patterns

| Pattern       | Value       | Usage                |
| ------------- | ----------- | -------------------- |
| Card Standard | `16px 24px` | 標準カード           |
| Card Large    | `24px`      | ヒーローカード       |
| Card Hero     | `48px 24px` | 大きなトップ padding |
| Tag           | `6px 16px`  | タグ/バッジ内部      |

### Spacing Rules

- 見出しの上に 2× base、下に 1× base
- コンポーネント内で一貫した gap (8px, 12px, 16px)
- ネスト: 外側 16px → 内側 8px → 6px

---

## 5. Components

### Border Radius

| Value | Usage                    |
| ----- | ------------------------ |
| 4-6px | 小要素、インプット       |
| 8px   | ボタン、小カード         |
| 12px  | 標準カード（デフォルト） |
| 24px  | 大カード、ヒーローカード |
| 100px | ピル型タグ               |

### Z-Index Layers

| Layer             | Value |
| ----------------- | ----- |
| Modals/Popups     | 2100  |
| Bottom Navigation | 2000  |
| Suggestion Card   | 1000  |
| Settings Panel    | 500   |

### Shared Components

**Location:** `src/lib/features/shared/components/`

These standardized components ensure visual consistency across the app. **Always prefer these over raw HTML elements.**

#### Button (`Button.svelte`)

Standardized button with consistent hover, focus, and disabled states.

```svelte
import Button from "$lib/features/shared/components/Button.svelte";

<!-- Variants: primary, secondary, ghost, danger -->
<!-- Sizes: sm, md, lg -->

<Button variant="primary" size="md" onclick={handleSave}>保存</Button>

<Button variant="ghost" size="sm" onclick={handleCancel}>キャンセル</Button>

<Button variant="danger" loading={isDeleting} onclick={handleDelete}>
  削除
</Button>
```

| Variant     | Usage                                           |
| ----------- | ----------------------------------------------- |
| `primary`   | Main actions (bg-primary, hover:bg-primary-800) |
| `secondary` | Secondary actions (bg-surface-100, border)      |
| `ghost`     | Minimal/cancel (transparent, hover:bg-base-200) |
| `danger`    | Destructive actions (bg-error)                  |

#### TextInput (`TextInput.svelte`)

Standardized text input with label, error, and hint support.

```svelte
import TextInput from "$lib/features/shared/components/TextInput.svelte";

<TextInput
  label="タイトル"
  bind:value={title}
  error={errors.title}
  placeholder="タスク名を入力"
  hint="最大100文字"
/>
```

| Prop       | Type    | Description                      |
| ---------- | ------- | -------------------------------- |
| `label`    | string  | Label above input                |
| `error`    | string  | Error message (shows red border) |
| `hint`     | string  | Helper text below input          |
| `disabled` | boolean | Disabled state                   |

#### Skeleton (`Skeleton.svelte`)

Loading placeholder for content.

```svelte
import Skeleton from "$lib/features/shared/components/Skeleton.svelte";

<!-- Variants: card, text, circle -->
<Skeleton variant="card" />
<Skeleton variant="text" width="60%" />
<Skeleton variant="circle" width="40px" height="40px" />
```

### Border Utility Classes

Semantic border opacity classes defined in `app.css`:

| Class                    | Opacity | Usage                     |
| ------------------------ | ------- | ------------------------- |
| `.border-faint`          | 20%     | Very subtle borders       |
| `.border-subtle`         | 50%     | Standard light borders    |
| `.border-primary-faint`  | 20%     | Primary color, very light |
| `.border-primary-subtle` | 50%     | Primary color, light      |

**Usage:**

```html
<!-- Instead of: border-base-300/50 -->
<div class="border-subtle border">...</div>

<!-- Instead of: border-primary/30 -->
<div class="border-primary-faint border">...</div>
```

### Component Patterns (Tailwind)

**Card**

```
bg-base-100 border border-base-300 rounded-xl p-4 shadow-sm
```

**Primary Button** (use `<Button variant="primary">` instead)

```
bg-[var(--color-primary)] hover:bg-[var(--color-primary-800)] text-white border-none
```

**Secondary Button** (use `<Button variant="secondary">` instead)

```
btn btn-ghost border border-base-300
```

**Input Field** (use `<TextInput>` instead)

```
input input-bordered w-full
```

**Modal Backdrop**

```
fixed inset-0 bg-black/40 backdrop-blur-sm
```

### Icon Sizes

| Size    | Usage                    |
| ------- | ------------------------ |
| 12px    | 極小ヘッダーアイコン     |
| 16px    | 小、インラインメタデータ |
| 24px    | 標準 UI 要素             |
| 36px    | 中、プロフィール写真     |
| 40-64px | 大、特徴的なビジュアル   |

---

## 6. Layout

### Flexbox Patterns

```css
/* Column */
display: flex;
flex-direction: column;
align-items: flex-start;
gap: 8px;

/* Row */
display: flex;
flex-direction: row;
align-items: center;
gap: 16px;

/* Centered */
display: flex;
justify-content: center;
align-items: center;
```

### Bottom Navigation

```css
--bottom-nav-height: 80px;
```

Content padding:

```
pb-[calc(80px+env(safe-area-inset-bottom))]
```

---

## 7. Responsive

### Breakpoints

| Name    | Value   | Usage                |
| ------- | ------- | -------------------- |
| Mobile  | < 768px | ボトムシート、フル幅 |
| Desktop | ≥ 768px | 中央モーダル、横並び |

### Rules

- **Mobile-first**: デフォルトスタイルはモバイル向け
- **Desktop enhancement**: `@media (min-width: 768px)`
- **Card width**: 220-600px を目指す
- **Overflow**: truncate より wrap を優先

### Popup Behavior

| Device  | Style        |
| ------- | ------------ |
| Mobile  | ボトムシート |
| Desktop | 中央モーダル |

---

## 8. Feedback & Loading States

### Loading States

Use `<Skeleton>` component instead of spinners for content loading:

```svelte
{#if isLoading}
  {#each Array(4) as _, i (i)}
    <Skeleton variant="card" />
  {/each}
{:else}
  {#each items as item (item.id)}
    <ItemCard {item} />
  {/each}
{/if}
```

### Processing States

For in-progress operations (like AI enrichment), use overlay with shimmer:

```svelte
{#if isProcessing}
  <div
    class="enriching-overlay absolute inset-0 z-10 flex items-center justify-center bg-base-content/60 backdrop-blur-sm"
  >
    <span class="loading loading-spinner text-primary"></span>
  </div>
{/if}
```

Add shimmer animation in `<style>` block:

```css
.enriching-overlay::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 100%
  );
  animation: shimmer 2s ease-in-out infinite;
}
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

### Toast Notifications

Use `toastState` for success/error feedback:

```typescript
import { toastState } from "$lib/bootstrap/index.svelte.ts";

toastState.show("success", "保存しました");
toastState.show("error", "エラーが発生しました");
```

---

## 9. WCAG Accessibility Standards

HomePA follows WCAG 2.2 Level AA compliance for accessibility.

### 9.1 Color Contrast Requirements

| Element Type                     | Minimum Ratio | WCAG Level | Notes                                    |
| -------------------------------- | ------------- | ---------- | ---------------------------------------- |
| Normal text (< 18px)             | **4.5:1**     | AA         | Body text, labels, descriptions          |
| Large text (≥ 18px or 14px bold) | **3:1**       | AA         | Headings, button text with font-semibold |
| UI components & graphics         | **3:1**       | AA         | Borders, icons, focus indicators         |
| Enhanced contrast                | **7:1**       | AAA        | Optional, for better legibility          |

#### Current Color Contrast Ratios

| Combination                            | Ratio  | Status             |
| -------------------------------------- | ------ | ------------------ |
| Primary text (#1F2937) on white        | 14.7:1 | ✅ Excellent       |
| Secondary text (#4B5563) on white      | 7.5:1  | ✅ AA + AAA        |
| Muted text (#6B7280) on white          | 5.0:1  | ✅ AA              |
| Neptune primary button (dark text)     | 5.8:1  | ✅ AA              |
| Error red (#DC2626) + white            | 4.6:1  | ✅ AA              |
| Success green (#2AB388) + white + bold | 3.2:1  | ✅ AA (large text) |

#### Low Contrast to Avoid

| Combination              | Ratio   | Issue                       |
| ------------------------ | ------- | --------------------------- |
| ~~#9CA3AF on white~~     | 2.8:1   | ❌ Fails AA - don't use     |
| ~~Neptune + white text~~ | 2.6:1   | ❌ Fails AA - use dark text |
| Any text below 4.5:1     | < 4.5:1 | ❌ Not accessible           |

### 9.2 Touch Target Sizes

| Standard            | Minimum Size | Usage                           |
| ------------------- | ------------ | ------------------------------- |
| WCAG 2.2 AA (2.5.8) | **24×24 px** | Absolute minimum for any target |
| Apple iOS HIG       | **44×44 pt** | Recommended for mobile          |
| Material Design     | **48×48 dp** | Android standard                |

#### Button Component Sizes

```typescript
// src/lib/features/shared/components/Button.svelte
sm: "h-10"; // 40px - exceeds WCAG AA
md: "h-11"; // 44px - meets iOS HIG
lg: "h-12"; // 48px - meets Material Design
```

#### Icon Button Minimum Sizes

- **Standalone icon buttons**: Minimum `h-8 w-8` (32px), prefer `h-10 w-10` (40px)
- **Touch target expansion**: Use invisible padding for visual compactness

```svelte
<!-- Visual: 20px icon, Touch: 44px target -->
<button
  class="relative h-5 w-5 before:absolute before:-inset-3 before:content-['']"
>
  <svg class="h-5 w-5">...</svg>
</button>
```

### 9.3 Focus Indicators

All interactive elements must have visible focus states:

```css
:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
  outline-offset: 2px;
}
```

### 9.4 Motion & Reduced Motion

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Checklist

UI 作業時に確認:

### Design

- [ ] Purpose: 何を解決する？誰が使う？
- [ ] Tone: 「静かな知性」に合っているか？
- [ ] Tailwind/DaisyUI ユーティリティを優先
- [ ] **Use shared components** (`Button`, `TextInput`, `Skeleton`)

### Accessibility (WCAG 2.2 AA)

- [ ] **Touch targets**: ≥ 24px minimum, prefer ≥ 44px for mobile
- [ ] **Text contrast**: ≥ 4.5:1 (normal text), ≥ 3:1 (large/bold text)
- [ ] **UI contrast**: ≥ 3:1 for borders, icons, focus indicators
- [ ] **Focus visible**: All interactive elements show focus ring
- [ ] **Reduced motion**: Animations respect `prefers-reduced-motion`
- [ ] **Never use**: #9CA3AF text (2.8:1), Neptune + white (2.6:1)

### Mobile

- [ ] Bottom nav (80px) + safe-area 考慮
- [ ] ポップアップ: モバイル=ボトムシート

### Interaction

- [ ] トランジション 200-300ms, ease-out
- [ ] モーダル: Escape / backdrop クリックで閉じる

### Loading & Feedback

- [ ] Loading state: use `<Skeleton>` not spinners
- [ ] Processing state: overlay with shimmer animation
- [ ] Success/error: use `toastState.show()`
