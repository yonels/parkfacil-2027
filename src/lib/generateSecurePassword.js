"use client";

// Genera una clave aleatoria criptográficamente segura en el navegador
// (window.crypto), nunca en el servidor ni en texto fijo. Compartido entre
// /usuarios y la ficha individual de usuario para no duplicar la lógica.
export function generateSecurePassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*-_+"];
  const alphabet = groups.join("");
  const randomIndex = (length) => {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] % length;
  };
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  while (characters.length < 16) characters.push(alphabet[randomIndex(alphabet.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join("");
}
