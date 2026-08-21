# WealthIQ - Personal Finance & Wealth Management Application

A modern, full-featured personal finance and money management web application built with **Next.js 15**, **React 19**, **TypeScript**, and **Tailwind CSS**.

---

## 🌟 Key Features & User Guide

### 🏦 Accounts & Net Worth Management
- **Accounts Ledger**: Classified account groups (`Bank Accounts`, `Cash`, `Credit Cards`, `Loans`, or custom user categories).
- **Indented Visual Hierarchy**: Accounts are visually nested under account groups for clean organization.
- **Summary Banner**: Displays Total Assets, Liabilities, and Net Worth side-by-side in a 3-column ledger summary.
- **Group Long-Press & Rename**: Touch/press and hold (500ms) on any Account Group header to pop up the **Rename Group** modal window and update all associated account categories in storage.
- **Account Long-Press & Editing**: Touch/press and hold (500ms) on any individual account row to open the **Edit Account** modal window with type-specific controls:
  - **Bank & Cash Accounts**: Name, Base Balance, Notes.
  - **Credit Cards**: Card Name, Base Balance, Credit Limit, Cycle Start Day, Due Day (1-31), Min Payment, Due Date Notification Days, Notes.
  - **Loans**: Loan Name, Base Balance, Interest Rate (% p.a.), Notes.
- **Balance Adjustments**: Instant balance adjustments with automatic adjustment logging.

---

### 💳 Transactions & Swipe Gestures
- **Multiple View Modes**: Daily ledger, Calendar grid, Monthly summary table, Category totals breakdown, and Notes.
- **Swipe Gestures**:
  - **Daily & Calendar Views**: Swipe **Left** to view the Next Month; Swipe **Right** to view the Previous Month.
  - **Monthly Breakdown View**: Swipe **Left** to view the Next Year; Swipe **Right** to view the Previous Year.
- **Header Date Navigation**:
  - Automatically switches between Month/Year selection (`AUG 2026`) on Daily/Calendar tabs and Year-only selection (`2026`) on the Monthly Breakdown tab.
- **Filtering & Search**: Multi-criterion search, account filters, category filters, and income/expense/transfer type filters.

---

### 📅 Calendar Views
- **Table Grid Styling**: Unified 7-column calendar table with distinct grid border lines (`divide-x`, `border-r border-b`) and weekday header bar across:
  - Transactions Calendar Tab (`src/app/transactions/page.tsx`)
  - Standalone Calendar Page (`src/app/calendar/page.tsx`)
  - Bills & Subscriptions Calendar View (`src/app/bills/page.tsx`)
  - Mobile App View (`src/components/MobileAppView.tsx`)
- **Daily Transaction Highlights**: Days with income/expenses highlight exact monetary values with color coding (Green for Income, Red for Expense).

---

### 📊 Analytics & Insights
- **Interactive Graphs**: Visual breakdown of income vs expenses, category distributions, and cash flow trends.
- **AI Insights Panel**: Automated financial analysis and savings suggestions.
- **Trip & Event Mode**: Group transactions under active travel trips for trip budget tracking.

---

### ⚙️ Settings & Customization
- **Account Settings Alignment**: Unified classification matching between Account Settings and Accounts pages.
- **Theme & Visibility Toggles**: Dark mode interface with customizable account visibility and archiving options.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: Next.js 15 (App Router)
- **Library**: React 19, TypeScript
- **Styling**: Tailwind CSS, Lucide React Icons
- **Charts**: Recharts
- **Notifications**: Sonner Toasts
- **Local Storage / Persistence**: Custom storage service (`src/lib/storage.ts`)

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:4028](http://localhost:4028) in your browser.

### Type Check & Build
```bash
npx tsc --noEmit
npm run build
```
