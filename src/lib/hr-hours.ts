export function calculateWorkHours(start: string, end: string) {
  const timePattern = /^(\d{1,2}):(\d{2})$/;
  const startMatch = timePattern.exec(start.trim());
  const endMatch = timePattern.exec(end.trim());
  if (!startMatch || !endMatch) return 0;
  const [startHour, startMinute, endHour, endMinute] = [
    Number(startMatch[1]), Number(startMatch[2]), Number(endMatch[1]), Number(endMatch[2]),
  ];
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return 0;
  const startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return (endMinutes - startMinutes) / 60;
}
