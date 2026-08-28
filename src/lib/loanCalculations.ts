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
