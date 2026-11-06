/**
 * Data e mes por extenso, montados a mao, para o aparelho E o servidor.
 *
 * A DATA NAO USA `Intl.DateTimeFormat` nem `toLocaleDateString`: a locale pedida so
 * vale se o runtime tiver os dados dela, e, faltando, a mesma data vira 01/09/2026
 * num ambiente e 09/01/2026 no outro, sem erro nenhum para investigar. O app e em
 * portugues por decisao de projeto, entao dia, mes e ano montados na ordem certa
 * custam tres linhas e dao o mesmo resultado em qualquer lugar.
 *
 * Mora em `compartilhado/` porque o servidor tambem escreve datas: o prompt da IA
 * recebia "05/11/2026" de `toLocaleDateString`, que depende do ICU e do fuso do
 * processo. Aqui o fuso continua sendo o do processo (ver `ambiente.ts`), mas o
 * formato nao depende mais de nada.
 */

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

export const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** 1757028000000 -> "05/11/2026". */
export function formatarData(ms: number): string {
  const d = new Date(ms);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "2026-11" -> "novembro de 2026". */
export function nomeMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  const nome = MESES[Number(mes) - 1] ?? '';
  return nome ? `${nome} de ${ano}` : String(ano);
}
