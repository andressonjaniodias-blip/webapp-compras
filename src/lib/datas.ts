/**
 * Conversoes de tempo. Todo timestamp no app e inteiro em milissegundos; aqui
 * ele vira texto para a tela, valor para `<input type="datetime-local">` e
 * chave de mes para os agrupamentos do resumo.
 *
 * O `<input datetime-local>` fala no fuso local e sem fuso explicito, entao a
 * conversao precisa ser manual: `toISOString()` devolveria UTC e jogaria uma
 * compra da meia-noite para o dia anterior.
 */

/*
 * A DATA E MONTADA A MAO, sem `Intl.DateTimeFormat`.
 *
 * `Intl.DateTimeFormat('pt-BR', ...)` parece garantir dd/mm/aaaa, mas a locale
 * pedida so vale se o runtime tiver os dados dela: faltando, ele cai na locale
 * padrao do sistema — e o mesmo codigo que mostra 01/09/2026 num aparelho mostra
 * 09/01/2026 no outro, sem erro nenhum para investigar. Foi exatamente o sintoma
 * relatado ("as datas mudaram para o padrao americano no outro aparelho").
 *
 * O app e em portugues por decisao de projeto, entao nao ha o que negociar com a
 * locale do sistema: dia, mes e ano montados na ordem certa custam tres linhas e
 * dao o mesmo resultado em qualquer lugar.
 */

import { doisDigitos, formatarData, nomeMes } from '../../compartilhado/datas';

// A mesma data e o mesmo mes por extenso que o servidor usa: uma copia so.
export { formatarData, nomeMes };

export function formatarDataCurta(ms: number): string {
  const d = new Date(ms);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`;
}

export function formatarHora(ms: number): string {
  const d = new Date(ms);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

export function formatarDataHora(ms: number): string {
  return `${formatarData(ms)} às ${formatarHora(ms)}`;
}

/** Timestamp -> "2026-08-19T14:30", que e o formato do input. */
export function paraInputDataHora(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-08-19T14:30" -> timestamp. `null` quando o campo esta pela metade. */
export function deInputDataHora(texto: string): number | null {
  if (!texto) return null;
  const ms = new Date(texto).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Timestamp -> "2026-08-19", que e o formato do input de data. */
export function paraInputData(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * "2026-08-19" -> timestamp no PRIMEIRO INSTANTE desse dia, no fuso local.
 *
 * `new Date('2026-08-19')` seria interpretado como UTC e voltaria um dia no
 * Brasil. Montar a data por partes evita isso.
 */
export function deInputData(texto: string): number | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return null;
  const ms = new Date(
    Number(partes[1]),
    Number(partes[2]) - 1,
    Number(partes[3]),
  ).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/*
 * Chave de mes ("2026-08"), mes anterior e intervalo de um mes: UMA copia, a de
 * `compartilhado/fatura.ts`, que o servidor tambem usa. Havia duas, identicas, e a
 * que alguem corrigisse sozinha faria o app e a IA discordarem sobre o que e "o mes".
 */
import { chaveDoMes, intervaloDoMes, somarMeses } from '../../compartilhado/fatura';

/** Chave de agrupamento por mes: "2026-08". Ordena alfabeticamente e cronologicamente. */
export const chaveMes = chaveDoMes;

/** "2026-08" -> a chave do mes anterior, para comparar um mes com o outro. */
export const mesAnterior = (chave: string): string => somarMeses(chave, -1);

/** Primeiro e ultimo instante de um mes, para filtrar por intervalo. */
export { intervaloDoMes };

/** "2026-11" -> "novembro". O ano so atrapalha num rotulo de uma linha. */
export function apenasMes(chave: string): string {
  return nomeMes(chave).replace(/ de \d{4}$/, '');
}

/** Chave do mes de hoje. */
export function mesAtual(): string {
  return chaveMes(Date.now());
}

/**
 * Os meses que uma lista por mes oferece: os que tem algo e, sempre, o corrente,
 * do mais recente ao mais antigo.
 *
 * O corrente entra mesmo vazio porque e o mes em que a pessoa esta: sem ele nao
 * haveria como chegar ao mes de hoje numa lista que ainda nao tem nada nele.
 */
export function mesesDaLista(chaves: Iterable<string>, agora: number): string[] {
  const todos = new Set(chaves);
  todos.add(chaveMes(agora));
  return [...todos].sort().reverse();
}
