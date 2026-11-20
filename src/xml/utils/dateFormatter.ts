/**
 * Formatea fechas al formato estándar paraguayo: DD/MM/YYYY (con hora opcional HH:mm:ss)
 * Ejemplos:
 *  "2025-01-13" -> "13/01/2025"
 *  "2024-05-18T10:15:00" -> "18/05/2024 10:15:00"
 */
export function formatParaguayDate(
  dateInput: string | Date | undefined | null,
  includeTime: boolean = false
): string {
  if (!dateInput) return '';

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    const day = String(dateInput.getDate()).padStart(2, '0');
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const year = dateInput.getFullYear();
    if (includeTime) {
      const hh = String(dateInput.getHours()).padStart(2, '0');
      const mm = String(dateInput.getMinutes()).padStart(2, '0');
      const ss = String(dateInput.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
    }
    return `${day}/${month}/${year}`;
  }

  const str = String(dateInput).trim();
  if (!str) return '';

  // Si ya viene en formato DD/MM/YYYY
  const ddmmyyyyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (ddmmyyyyMatch) {
    const [, dd, mm, yyyy, time] = ddmmyyyyMatch;
    if (includeTime && time) {
      return `${dd}/${mm}/${yyyy} ${time}`;
    }
    return `${dd}/${mm}/${yyyy}`;
  }

  // Formato ISO YYYY-MM-DD o YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})(?:[T\s](\d{2}:\d{2}(?::\d{2})?))?/);
  if (isoMatch) {
    const [, yyyy, mm, dd, time] = isoMatch;
    if (includeTime && time) {
      return `${dd}/${mm}/${yyyy} ${time}`;
    }
    return `${dd}/${mm}/${yyyy}`;
  }

  // Intento de parseo estándar
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    if (includeTime) {
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      const ss = String(parsed.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
    }
    return `${day}/${month}/${year}`;
  }

  return str;
}
