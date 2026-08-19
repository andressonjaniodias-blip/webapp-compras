/**
 * A unica fronteira entre centavos inteiros e texto em portugues.
 *
 * Existe isolado porque o resto do app nunca deve ver um numero com virgula:
 * toda conta acontece em centavos inteiros, e so aqui isso vira "R$ 18,52" e
 * volta. Espalhar `toFixed(2)` pelas telas e como o erro de arredondamento se
 * infiltra num controle de gastos.
 *
 * O parse e feito com aritmetica de texto, sem `parseFloat` no valor final:
 * 18.52 * 100 da 1852.0000000000002 em ponto flutuante, e depender de
 * `Math.round` para consertar isso e apostar que o proximo caso tambem cai do
 * lado certo.
 */

const formatadorReais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatadorSimples = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1852 -> "R$ 18,52". Para exibir. */
export function formatarReais(centavos: number): string {
  return formatadorReais.format(centavos / 100);
}

/** 1852 -> "18,52". Para dentro de campo de digitacao. */
export function formatarCentavos(centavos: number): string {
  return formatadorSimples.format(centavos / 100);
}

/**
 * "18,52", "18.52", "1.234,56" e "1852" viram centavos inteiros.
 *
 * A ambiguidade do ponto e resolvida assim: se ha virgula, ela e a decimal e o
 * ponto e separador de milhar. Se so ha ponto, ele e decimal quando sobram no
 * maximo dois digitos depois dele — senao e milhar. E o que faz "1.234" virar
 * R$ 1.234,00 e "12.34" virar R$ 12,34.
 */
export function paraCentavos(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo) return 0;

  const negativo = limpo.trimStart().startsWith('-');
  let corpo = limpo.replace(/-/g, '');

  if (corpo.includes(',')) {
    corpo = corpo.replace(/\./g, '');
    const virgula = corpo.lastIndexOf(',');
    corpo = corpo.slice(0, virgula).replace(/,/g, '') + '.' + corpo.slice(virgula + 1);
  } else if (corpo.includes('.')) {
    const ponto = corpo.lastIndexOf('.');
    const casas = corpo.length - ponto - 1;
    if (casas > 0 && casas <= 2) {
      corpo = corpo.slice(0, ponto).replace(/\./g, '') + '.' + corpo.slice(ponto + 1);
    } else {
      corpo = corpo.replace(/\./g, '');
    }
  }

  const [inteiro = '0', fracao = ''] = corpo.split('.');
  const centavos = Number(inteiro || '0') * 100 + Number(fracao.slice(0, 2).padEnd(2, '0') || '0');
  return negativo ? -centavos : centavos;
}

/**
 * 1.235 -> "1,235". Ate tres casas, sem zero a toa: quantidade de balança
 * chega em grama, mas "2" nao precisa virar "2,000".
 */
export function formatarQuantidade(quantidade: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(quantidade);
}

/** "1,235" -> 1.235. Aceita ponto tambem, porque teclado de celular varia. */
export function paraQuantidade(texto: string): number {
  const limpo = texto.replace(/[^\d,.]/g, '').replace(/\./g, '.').replace(',', '.');
  const partes = limpo.split('.');
  const normalizado = partes.length > 2 ? partes[0] + '.' + partes.slice(1).join('') : limpo;
  const valor = Number.parseFloat(normalizado);
  if (!Number.isFinite(valor) || valor < 0) return 0;
  // Tres casas e o limite util: grama, mililitro. Alem disso e ruido de digitacao.
  return Math.round(valor * 1000) / 1000;
}
