/**
 * Pequenos ajudantes de texto da interface.
 *
 * `plural` existe para acabar com o "compra(s)", "mes(es)", "registro(s)": o
 * parentese entre parenteses e uma pergunta que o app deveria ter respondido. Quem
 * le "1 registro(s)" esta lendo um texto que nao sabe contar.
 */

/** `plural(1, 'compra', 'compras')` -> "compra"; `plural(2, ...)` -> "compras". */
export function plural(quantidade: number, singular: string, varios: string): string {
  return quantidade === 1 ? singular : varios;
}

/** "3 compras", "1 compra", "0 compras" — o numero e a palavra juntos. */
export function contagem(quantidade: number, singular: string, varios: string): string {
  return `${quantidade} ${plural(quantidade, singular, varios)}`;
}
