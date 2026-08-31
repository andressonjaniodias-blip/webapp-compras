/**
 * O ciclo do cartao: quando a compra de hoje fecha, quando ela vence, e quantos
 * dias voce tem ate pagar.
 *
 * Mora em `compartilhado/` porque o servidor precisa exatamente destas contas
 * para montar o prompt das dicas. Duas copias divergiriam em silencio — o mesmo
 * motivo que o topo de `tipos.ts` da para este diretorio existir.
 *
 * A REGRA, que cobre as duas convencoes brasileiras sem pedir um terceiro campo
 * ao usuario:
 *
 *   1. Compra no dia X. Se `dia(X) <= diaFechamento`, ela fecha no fechamento
 *      DESTE mes; se passou, fecha no do mes seguinte.
 *   2. O vencimento e a primeira ocorrencia de `diaVencimento` ESTRITAMENTE
 *      depois do fechamento. Fechou dia 20 e vence dia 27: mesmo mes. Fechou dia
 *      28 e vence dia 5: mes seguinte. Sai de graca da mesma comparacao.
 *
 * A competencia e a chave do mes do VENCIMENTO ("2026-09"), porque e assim que
 * se fala: "a fatura que vence em setembro". Nomear pelo fechamento faria a tela
 * discordar do aplicativo do banco.
 *
 * Comprar um dia depois do fechamento da quase dois meses de prazo em vez de
 * uma semana. Isso e decisao de compra de verdade, e cai de graca daqui.
 */

import type { Conta } from './tipos';

const DIA_EM_MS = 86_400_000;

/** Quantos dias tem o mes. `mes` e 0-based, como no `Date`. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

/**
 * Dia 31 em fevereiro vira 28 (ou 29). Sem isto, `new Date(2026, 1, 31)`
 * escorregaria para 3 de março e a fatura mudaria de mes sozinha.
 */
export function diaDoMesSeguro(ano: number, mes: number, dia: number): number {
  const limite = diasNoMes(ano, mes);
  if (!Number.isFinite(dia) || dia < 1) return 1;
  return Math.min(Math.floor(dia), limite);
}

/** "2026-09" a partir de um timestamp, no fuso local. */
export function chaveDoMes(ms: number): string {
  const d = new Date(ms);
  return montarChave(d.getFullYear(), d.getMonth());
}

function montarChave(ano: number, mes: number): string {
  // `mes` pode vir fora de 0-11; o Date normaliza o transbordo de ano.
  const d = new Date(ano, mes, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function partesDaChave(chave: string): { ano: number; mes: number } {
  const [ano, mes] = chave.split('-').map(Number);
  return { ano: ano ?? 1970, mes: (mes ?? 1) - 1 };
}

/** "2026-09" + 4 -> "2027-01". Aceita negativo. */
export function somarMeses(chave: string, meses: number): string {
  const { ano, mes } = partesDaChave(chave);
  return montarChave(ano, mes + meses);
}

/** Quantos meses de `de` ate `ate`. Negativo quando `ate` e anterior. */
export function distanciaEmMeses(de: string, ate: string): number {
  const a = partesDaChave(de);
  const b = partesDaChave(ate);
  return (b.ano - a.ano) * 12 + (b.mes - a.mes);
}

/** Primeiro e ultimo instante de um mes. */
export function intervaloDoMes(chave: string): { inicio: number; fim: number } {
  const { ano, mes } = partesDaChave(chave);
  return {
    inicio: new Date(ano, mes, 1, 0, 0, 0, 0).getTime(),
    fim: new Date(ano, mes + 1, 1, 0, 0, 0, 0).getTime() - 1,
  };
}

/** O ultimo instante do dia, para o fechamento incluir o dia inteiro. */
function fimDoDia(ano: number, mes: number, dia: number): number {
  return new Date(ano, mes, diaDoMesSeguro(ano, mes, dia), 23, 59, 59, 999).getTime();
}

function inicioDoDia(ano: number, mes: number, dia: number): number {
  return new Date(ano, mes, diaDoMesSeguro(ano, mes, dia), 0, 0, 0, 0).getTime();
}

/** A fatura vence no mesmo mes em que fecha, ou no seguinte? */
function venceNoMesSeguinte(conta: Conta): boolean {
  return conta.diaVencimento <= conta.diaFechamento;
}

/** Em que mes fecha a fatura que engloba uma compra feita em `ms`. */
function mesDeFechamento(conta: Conta, ms: number): { ano: number; mes: number } {
  const d = new Date(ms);
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const fechamento = diaDoMesSeguro(ano, mes, conta.diaFechamento);

  if (d.getDate() <= fechamento) return { ano, mes };

  const seguinte = new Date(ano, mes + 1, 1);
  return { ano: seguinte.getFullYear(), mes: seguinte.getMonth() };
}

/**
 * A competencia da fatura em que a compra cai — ou seja, o mes em que voce vai
 * pagar por ela.
 */
export function competenciaDe(conta: Conta, ms: number): string {
  const fechamento = mesDeFechamento(conta, ms);
  const deslocamento = venceNoMesSeguinte(conta) ? 1 : 0;
  return montarChave(fechamento.ano, fechamento.mes + deslocamento);
}

/** Instante em que a fatura de uma competencia fecha. */
export function fechamentoDe(conta: Conta, competencia: string): number {
  const { ano, mes } = partesDaChave(competencia);
  const deslocamento = venceNoMesSeguinte(conta) ? -1 : 0;
  const alvo = new Date(ano, mes + deslocamento, 1);
  return fimDoDia(alvo.getFullYear(), alvo.getMonth(), conta.diaFechamento);
}

/** Instante em que a fatura de uma competencia vence. */
export function vencimentoDe(conta: Conta, competencia: string): number {
  const { ano, mes } = partesDaChave(competencia);
  return inicioDoDia(ano, mes, conta.diaVencimento);
}

/**
 * De quando a quando vao as compras que compoem esta fatura.
 *
 * Serve para a tela dizer "compras de 21/08 a 20/09". Quem decide de fato o que
 * entra na fatura sao as parcelas (ver `parcelamento.ts`) — isto e leitura.
 */
export function intervaloDoCiclo(
  conta: Conta,
  competencia: string,
): { inicio: number; fim: number } {
  const fim = fechamentoDe(conta, competencia);
  const anterior = fechamentoDe(conta, somarMeses(competencia, -1));
  return { inicio: anterior + 1, fim };
}

/**
 * Quantos dias entre comprar e pagar. E o numero que decide se vale esperar o
 * fechamento passar.
 */
export function diasAtePagar(conta: Conta, ms: number): number {
  const vencimento = vencimentoDe(conta, competenciaDe(conta, ms));
  return Math.max(0, Math.round((vencimento - ms) / DIA_EM_MS));
}

/** A fatura ja fechou? Depois disso, o valor dela nao muda mais sozinho. */
export function jaFechou(conta: Conta, competencia: string, agora: number): boolean {
  return agora > fechamentoDe(conta, competencia);
}
