# Bootstrap Architecture

This directory contains the centralized state management and initialization for the Personal Assistant application using Svelte 5 reactive state.

## 🏗️ Architecture Overview

The bootstrap layer provides global state and initialization:

```
src/lib/bootstrap/
├── README.md                 # This file - architecture documentation
├── bootstrap.ts              # App initialization
├── ui.svelte.ts              # UI state (views, modes, loading)
├── data.svelte.ts            # Core data (selected date)
├── toast.svelte.ts           # Toast notifications state
├── settings.svelte.ts        # App settings state
├── timezone.ts               # Timezone management
├── devtools.ts               # Developer tools
├── index.svelte.ts           # Main barrel export
└── compat.svelte.ts          # Compatibility layer (deprecated, re-exports index)
```

## 📁 File Responsibilities

### **Initialization (`bootstrap.ts`)**

- **Purpose**: Central initialization for the application
- **Usage**: Called once in the root layout

### **UI State (`ui.svelte.ts`)**

- **Purpose**: Manages UI state that affects the overall application layout
- **Contains**: View mode, loading state, error messages
- **Example**: `viewMode`, `isLoading`, `errorMessage`

### **Data State (`data.svelte.ts`)**

- **Purpose**: Core application data (selected date)
- **Contains**: Selected date for calendar/assistant views
- **Example**: `selectedDate`

### **Toast State (`toast.svelte.ts`)**

- **Purpose**: Toast notification management
- **Contains**: Active toasts, show/dismiss functions
- **Usage**: `toastState.success("Message")`

## 🔄 Data Flow

```
User Interaction → State Method → State Update → Component Reactivity
```

1. **User interacts** with UI (clicks button, navigates)
2. **Component calls** state method (e.g., `dataState.setSelectedDate()`)
3. **State updates** automatically trigger component re-renders
4. **UI reflects** the new state

## 🎯 Key Principles

### **1. Svelte 5 Reactive Classes**

- State is managed using `$state` runes in classes
- Classes are instantiated once as singletons
- Direct property access (no `$` prefix needed in templates)

### **2. Single Source of Truth**

- All global data lives in state classes
- No duplicate state between components
- State classes are the authoritative data source

### **3. Feature-Based Organization**

- Feature-specific state lives in `features/{feature}/state/`
- Bootstrap only contains truly global state
- Components import directly from state files

## 📖 Usage Examples

### **Accessing State**

```typescript
import { dataState, calendarState } from "$lib/bootstrap/index.svelte.ts";

// In component template
{
  dataState.selectedDate;
}

// In component script
dataState.setSelectedDate(new Date());
calendarState.fetchEvents(start, end);
```

### **Toast Notifications**

```typescript
import { toastState } from "$lib/bootstrap/index.svelte.ts";

toastState.success("Event created!");
toastState.error("Failed to save");
```

### **Event Form**

```typescript
import { eventFormState } from "$lib/bootstrap/index.svelte.ts";

eventFormState.updateField("title", "My Event");
eventFormState.validate();
```

## 📚 Related Documentation

- [DATA_FLOW.md](../../docs/implementation_guide/DATA_FLOW.md) - Detailed data flow documentation
