/**
 * Escalas para desenhar: do valor ao pixel do `viewBox`.
 *
 * So geometria. Dinheiro vira texto em `lib/dinheiro.ts` (invariante 1), e as
 * contas por tras de cada numero vivem em `lib/series.ts`: um componente de
 * grafico nao decide o que um valor significa, so onde ele fica.
 */

/**
 * Mapeia um valor do dominio `[d0, d1]` para o intervalo `[r0, r1]`.
 *
 * Dominio de largura zero (todos os valores iguais) cai no meio do intervalo: uma
 * linha reta no meio e a leitura certa de "nada mudou", e dividir por zero daria
 * NaN no atributo do SVG.
 */
export function escalaLinear(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): (valor: number) => number {
  const amplitude = d1 - d0;
  return (valor) => (amplitude === 0 ? (r0 + r1) / 2 : r0 + ((valor - d0) / amplitude) * (r1 - r0));
}

/**
 * Sobe `valor` ate um numero redondo (1, 2, 2,5, 5 vezes uma potencia de dez),
 * para o teto de um eixo nao terminar em R$ 4.637,11.
 */
export function tetoRedondo(valor: number): number {
  if (valor <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (valor <= passo * potencia) return passo * potencia;
  }
  return 10 * potencia;
}
