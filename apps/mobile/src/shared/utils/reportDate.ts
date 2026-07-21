type ReportDateFormatOptions = {
  includeTime?: boolean;
};

const padTwoDigits = (value: number) => String(value).padStart(2, '0');

export function formatReportCreatedDate(
  value?: string | null,
  {includeTime = false}: ReportDateFormatOptions = {},
): string {
  const normalized = value?.trim();

  if (!normalized) {
    return '';
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}. ${dateOnlyMatch[2]}. ${dateOnlyMatch[3]}.`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const dateLabel = `${date.getFullYear()}. ${padTwoDigits(date.getMonth() + 1)}. ${padTwoDigits(date.getDate())}.`;
  if (!includeTime) {
    return dateLabel;
  }

  const hours = date.getHours();
  const period = hours < 12 ? '오전' : '오후';
  const hour = hours % 12 || 12;

  return `${dateLabel} ${period} ${hour}:${padTwoDigits(date.getMinutes())}`;
}

export function formatReportCreatedAtLabel(
  value?: string | null,
  options?: ReportDateFormatOptions,
): string {
  const formatted = formatReportCreatedDate(value, options);
  return formatted ? `생성일 ${formatted}` : '생성일 확인 불가';
}
