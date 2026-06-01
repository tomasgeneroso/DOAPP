// Number helpers for Argentine number formatting (punto = miles, coma = decimal).

/**
 * Parse a number in Argentine format. Ej: "40.000" -> 40000, "40.000,50" -> 40000.50
 */
export const parseArgentineNumber = (value: string): number => {
  if (!value) return 0;
  let cleaned = value.trim();
  // Si tiene coma, es decimal argentino: reemplazar puntos por nada y coma por punto
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Si solo tiene puntos, asumimos que son separadores de miles
    cleaned = cleaned.replace(/\./g, "");
  }
  return parseFloat(cleaned) || 0;
};

/**
 * Sanitize a budget input string, keeping only digits, dots and commas.
 */
export const formatBudgetInput = (value: string): string => {
  return value.replace(/[^0-9.,]/g, "");
};
