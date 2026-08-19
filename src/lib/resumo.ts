/**
 * As contas do resumo mensal. Funcoes puras, sem banco: recebem as compras ja
 * carregadas e devolvem numeros.
 *
 * Rodar em memoria e proposital. O volume aqui e de dezenas de compras por mes,
 * e um `reduce` sobre isso custa menos de um milissegundo — muito menos que a
 * complexidade de manter indices agregados que precisariam ser reconciliados a
 * cada sincronizacao.
 */

import type { CompraLocal } from '../dados/banco';
import { chaveMes, mesAnterior } from './datas';

export interface FatiaResumo {
  nome: string;
  total: number;
  /** 0 a 100, para desenhar a barra. */
  percentual: number;
  quantidade: number;
}

export interface ResumoMensal {
  mes: string;
  total: number;
  quantidade: number;
  /** Centavos. Media por compra. */
  media: number;
  porCategoria: FatiaResumo[];
  porFormaPagamento: FatiaResumo[];
  /** Total do mes anterior, quando existe compra la. */
  totalAnterior: number | null;
  /** Diferença em centavos contra o mes anterior. Positivo = gastou mais. */
  variacao: number | null;
  maiorCompra: CompraLocal | null;
}

/** Meses que tem pelo menos uma compra, do mais recente para o mais antigo. */
export function mesesComCompras(compras: readonly CompraLocal[]): string[] {
  const chaves = new Set(compras.map((c) => chaveMes(c.data)));
  return [...chaves].sort().reverse();
}

export function comprasDoMes(compras: readonly CompraLocal[], mes: string): CompraLocal[] {
  return compras.filter((c) => chaveMes(c.data) === mes);
}

function agrupar(
  compras: readonly CompraLocal[],
  campo: (c: CompraLocal) => string,
  total: number,
): FatiaResumo[] {
  const mapa = new Map<string, { total: number; quantidade: number }>();

  for (const compra of compras) {
    const chave = campo(compra) || 'Sem definição';
    const atual = mapa.get(chave) ?? { total: 0, quantidade: 0 };
    atual.total += compra.total;
    atual.quantidade += 1;
    mapa.set(chave, atual);
  }

  return [...mapa.entries()]
    .map(([nome, dados]) => ({
      nome,
      total: dados.total,
      quantidade: dados.quantidade,
      percentual: total > 0 ? (dados.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function resumirMes(compras: readonly CompraLocal[], mes: string): ResumoMensal {
  const doMes = comprasDoMes(compras, mes);
  const total = doMes.reduce((soma, c) => soma + c.total, 0);

  const anteriores = comprasDoMes(compras, mesAnterior(mes));
  const totalAnterior = anteriores.length > 0
    ? anteriores.reduce((soma, c) => soma + c.total, 0)
    : null;

  const maiorCompra = doMes.reduce<CompraLocal | null>(
    (maior, c) => (maior === null || c.total > maior.total ? c : maior),
    null,
  );

  return {
    mes,
    total,
    quantidade: doMes.length,
    media: doMes.length > 0 ? Math.round(total / doMes.length) : 0,
    porCategoria: agrupar(doMes, (c) => c.categoria, total),
    porFormaPagamento: agrupar(doMes, (c) => c.formaPagamento, total),
    totalAnterior,
    variacao: totalAnterior === null ? null : total - totalAnterior,
    maiorCompra,
  };
}
