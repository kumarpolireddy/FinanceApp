/** Shared loan calculations used by both account settings and the loans workspace. */
export function calculateRemainingTenure(
  outstanding: number,
  annualRate: number,
  emi: number
): number {
  if (outstanding <= 0) return 0;
  if (annualRate <= 0 || emi <= 0) return Math.ceil(outstanding / (emi || 1));

  const monthlyRate = annualRate / 12 / 100;
  if (emi <= outstanding * monthlyRate) {
    return 120;
  }

  const months = -Math.log(1 - (outstanding * monthlyRate) / emi) / Math.log(1 + monthlyRate);
  return Math.ceil(months);
}

export function calculateNewEMI(
  outstanding: number,
  annualRate: number,
  remainingMonths: number
): number {
  if (outstanding <= 0 || remainingMonths <= 0) return 0;
  if (annualRate <= 0) return Math.ceil(outstanding / remainingMonths);

  const monthlyRate = annualRate / 12 / 100;
  const growth = Math.pow(1 + monthlyRate, remainingMonths);
  return Math.ceil((outstanding * monthlyRate * growth) / (growth - 1));
}

export function getNextEmiDateStr(currentDueStr: string, dueDay: number): string {
  if (!currentDueStr || !/^\d{4}-\d{2}-\d{2}$/.test(currentDueStr)) return '';

  const [year, month] = currentDueStr.split('-').map(Number);
  const nextDueDate = new Date(year, month, dueDay || 5);
  return nextDueDate.toISOString().slice(0, 10);
}

interface LoanPreviewInput {
  type: string;
  originalAmount: string;
  interestRate: string;
  tenureType: string;
  tenureYears: string;
  tenureMonths: string;
  interestType: string;
  startDate: string;
}

/** Preview loan payments without rounding intermediate totals. */
export function calculateLoanPreview(accountForm: LoanPreviewInput) {
  if (accountForm.type !== 'loan') return null;
  const p = parseFloat(accountForm.originalAmount) || 0;
  const r = parseFloat(accountForm.interestRate) || 0;
  const tenureMonthsVal =
    accountForm.tenureType === 'years'
      ? parseFloat(accountForm.tenureYears) * 12
      : parseFloat(accountForm.tenureMonths);
  const n = tenureMonthsVal || 0;

  if (p <= 0 || r <= 0 || n <= 0) return null;

  const monthlyRate = r / 12 / 100;
  let calculatedEmi = 0;
  if (accountForm.interestType === 'flat') {
    calculatedEmi = (p + p * (r / 100) * (n / 12)) / n;
  } else {
    calculatedEmi =
      (p * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  }

  const totalPayment = calculatedEmi * n;
  const totalInterest = totalPayment - p;

  const startStr = accountForm.startDate || new Date().toISOString().slice(0, 10);
  const start = new Date(startStr);
  const end = new Date(start.getFullYear(), start.getMonth() + n, start.getDate());

  return {
    emi: Math.ceil(calculatedEmi),
    totalPayment: Math.ceil(totalPayment),
    totalInterest: Math.ceil(totalInterest),
    endDate: end.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' }),
  };
}
