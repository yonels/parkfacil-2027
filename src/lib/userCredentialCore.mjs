export const MIN_PASSWORD_LENGTH = 12;

export function validateDirectPassword(value) {
  const password = String(value || "");
  const errors = [];
  if (password.length < MIN_PASSWORD_LENGTH) errors.push(`La clave debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (!/[a-z]/.test(password)) errors.push("La clave debe incluir una letra minúscula.");
  if (!/[A-Z]/.test(password)) errors.push("La clave debe incluir una letra mayúscula.");
  if (!/\d/.test(password)) errors.push("La clave debe incluir un número.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("La clave debe incluir un símbolo.");
  return errors;
}
