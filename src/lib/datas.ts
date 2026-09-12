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

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

const doisDigitos = (n: number) => String(n).padStart(2, '0');

export function formatarData(ms: number): string {
  const d = new Date(ms);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

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

/** Chave de agrupamento por mes: "2026-08". Ordena alfabeticamente e cronologicamente. */
export function chaveMes(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-08" -> "agosto de 2026". Pelo mesmo motivo do topo, sem `Intl`. */
export function nomeMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  const indice = Number(mes) - 1;
  const nome = MESES[indice] ?? '';
  return nome ? `${nome} de ${ano}` : String(ano);
}

/** "2026-08" -> a chave do mes anterior, para comparar um mes com o outro. */
export function mesAnterior(chave: string): string {
  const [ano, mes] = chave.split('-');
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return chaveMes(d.getTime());
}

/** Primeiro e ultimo instante de um mes, para filtrar por intervalo. */
export function intervaloDoMes(chave: string): { inicio: number; fim: number } {
  const [ano, mes] = chave.split('-');
  const inicio = new Date(Number(ano), Number(mes) - 1, 1, 0, 0, 0, 0).getTime();
  const fim = new Date(Number(ano), Number(mes), 1, 0, 0, 0, 0).getTime() - 1;
  return { inicio, fim };
}

/** Chave do mes de hoje. */
export function mesAtual(): string {
  return chaveMes(Date.now());
}
