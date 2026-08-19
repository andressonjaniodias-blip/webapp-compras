/**
 * Conversoes de tempo. Todo timestamp no app e inteiro em milissegundos; aqui
 * ele vira texto para a tela, valor para `<input type="datetime-local">` e
 * chave de mes para os agrupamentos do resumo.
 *
 * O `<input datetime-local>` fala no fuso local e sem fuso explicito, entao a
 * conversao precisa ser manual: `toISOString()` devolveria UTC e jogaria uma
 * compra da meia-noite para o dia anterior.
 */

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtMesLongo = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export function formatarData(ms: number): string {
  return fmtData.format(ms);
}

export function formatarDataCurta(ms: number): string {
  return fmtDataCurta.format(ms);
}

export function formatarDataHora(ms: number): string {
  return `${fmtData.format(ms)} às ${fmtHora.format(ms)}`;
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

/** Chave de agrupamento por mes: "2026-08". Ordena alfabeticamente e cronologicamente. */
export function chaveMes(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-08" -> "agosto de 2026". */
export function nomeMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  return fmtMesLongo.format(d);
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
