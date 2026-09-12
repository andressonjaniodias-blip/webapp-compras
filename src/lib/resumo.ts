/**
 * As contas do resumo mensal. Funcoes puras, sem banco: recebem as compras ja
 * carregadas e devolvem numeros.
 *
 * Rodar em memoria e proposital. O volume aqui e de dezenas de compras por mes,
 * e um `reduce` sobre isso custa menos de um milissegundo — muito menos que a
 * complexidade de manter indices agregados que precisariam ser reconciliados a
 * cada sincronizacao.
 *
 * O QUE ESTE ARQUIVO NAO FAZ: caixa. Aqui tudo e "o que eu comprei", somando
 * credito e debito no mesmo bolo, porque a pergunta e sobre consumo. Quanto SAIU
 * da conta e outra pergunta, e ela mora em `resumoDoMes`, em
 * `compartilhado/carteira.ts`. As duas telas mostram os dois numeros lado a lado
 * justamente porque eles divergem de proposito.
 */

import type { CompraLocal } from '../dados/banco';
import {
  acharConta,
  gastoPorGrupo,
  ocorrenciasDeRenda,
  type DadosFinanceiros,
} from '../../compartilhado/carteira';
import { naoExcluido, type Conta } from '../../compartilhado/tipos';
import { chaveMes, intervaloDoMes, mesAnterior } from './datas';

export interface FatiaResumo {
  nome: string;
  total: number;
  /** 0 a 100, para desenhar a barra. */
  percentual: number;
  quantidade: number;
  /**
   * Diferença em centavos contra o MESMO grupo no mes anterior.
   *
   * `null` quando o grupo nao existia la, e `null` nao e zero: "apareceu agora" e
   * uma informacao diferente de "nao mudou", e a tela desenha as duas diferente.
   */
  delta: number | null;
  /** As compras que somam este total, para a fatia poder abrir sem recalcular. */
  compras: CompraLocal[];
}

export interface ResumoMensal {
  mes: string;
  /** Tudo que foi comprado no mes, credito incluso. NAO e o que saiu do caixa. */
  total: number;
  quantidade: number;
  /** Centavos. Media por compra. */
  media: number;
  porCategoria: FatiaResumo[];
  porFormaPagamento: FatiaResumo[];
  /** Agrupado pela conta de verdade. Vazio quando nao ha conta cadastrada. */
  porConta: FatiaResumo[];
  /** Total do mes anterior, quando existe compra la. */
  totalAnterior: number | null;
  /** Diferença em centavos contra o mes anterior. Positivo = gastou mais. */
  variacao: number | null;
  /**
   * O gasto do mes SEM as categorias eventuais.
   *
   * E este o numero que se compara com o mes tipico, e nao o `total`: a media de
   * `estimarGastoCorrente` exclui eventual de proposito (uma geladeira nao se
   * repete), entao comparar o total contra ela acusaria "R$ 1.200 acima do
   * normal" todo mes em que houvesse uma compra grande e unica — exatamente a
   * distorcao que a separacao em grupos existe para evitar.
   */
  recorrente: number;
  /** A media dos meses completos anteriores, quando ha base para ela. */
  tipico: number | null;
  /**
   * `recorrente - tipico`. Positivo = gastou mais que o normal.
   *
   * Existe porque comparar com UM mes anterior e ruidoso: uma geladeira em agosto
   * faz setembro parecer economico sem nada ter mudado. A media de tres meses
   * ja era calculada pela previsao e nao era usada aqui.
   */
  comparadoAoTipico: number | null;
  maiorCompra: CompraLocal | null;
}

/**
 * Meses que tiveram QUALQUER movimento, do mais recente para o mais antigo.
 *
 * Compra, entrada ou pagamento. A versao anterior olhava so compras, e o efeito
 * era um mes com salario e fatura paga ficar inalcançavel no seletor da tela — e
 * ausente da planilha.
 *
 * As recorrencias sao expandidas so ate `agora`: um salario mensal geraria meses
 * para sempre, e o seletor listaria futuro vazio.
 */
export function mesesComMovimento(dados: DadosFinanceiros, agora: number): string[] {
  const chaves = new Set<string>();

  for (const compra of dados.compras) {
    if (naoExcluido(compra) && compra.data <= agora) chaves.add(chaveMes(compra.data));
  }
  for (const renda of dados.rendas) {
    if (!naoExcluido(renda)) continue;
    for (const ms of ocorrenciasDeRenda(renda, agora)) chaves.add(chaveMes(ms));
  }
  for (const transferencia of dados.transferencias) {
    if (naoExcluido(transferencia) && transferencia.data <= agora) {
      chaves.add(chaveMes(transferencia.data));
    }
  }

  return [...chaves].sort().reverse();
}

export function comprasDoMes(compras: readonly CompraLocal[], mes: string): CompraLocal[] {
  return compras.filter((c) => chaveMes(c.data) === mes);
}

function agrupar(
  compras: readonly CompraLocal[],
  campo: (c: CompraLocal) => string,
  total: number,
  anteriores?: ReadonlyMap<string, number>,
): FatiaResumo[] {
  const mapa = new Map<string, { total: number; compras: CompraLocal[] }>();

  for (const compra of compras) {
    const chave = campo(compra) || 'Sem definição';
    const atual = mapa.get(chave) ?? { total: 0, compras: [] };
    atual.total += compra.total;
    atual.compras.push(compra);
    mapa.set(chave, atual);
  }

  return [...mapa.entries()]
    .map(([nome, dados]) => ({
      nome,
      total: dados.total,
      quantidade: dados.compras.length,
      percentual: total > 0 ? (dados.total / total) * 100 : 0,
      delta:
        anteriores === undefined || !anteriores.has(nome)
          ? null
          : dados.total - anteriores.get(nome)!,
      compras: dados.compras,
    }))
    .sort((a, b) => b.total - a.total);
}

/** So os totais por grupo: a base de comparacao, sem carregar as compras. */
function totaisPor(
  compras: readonly CompraLocal[],
  campo: (c: CompraLocal) => string,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const compra of compras) {
    const chave = campo(compra) || 'Sem definição';
    mapa.set(chave, (mapa.get(chave) ?? 0) + compra.total);
  }
  return mapa;
}

export interface OpcoesResumo {
  /** Para agrupar por conta de verdade. Sem elas, `porConta` vem vazio. */
  contas?: readonly Conta[];
  /** A media dos meses completos, vinda de `estimarGastoCorrente`. */
  tipico?: number | null;
}

/**
 * O resumo de um mes.
 *
 * O `tipico` entra por PARAMETRO, e nao por importacao de `previsao.ts`, para
 * este arquivo continuar puro e sem dependencia de ciclo: quem chama ja tem a
 * estimativa em maos.
 */
export function resumirMes(
  compras: readonly CompraLocal[],
  mes: string,
  opcoes: OpcoesResumo = {},
): ResumoMensal {
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

  const contas = opcoes.contas ?? [];
  const tipico = opcoes.tipico ?? null;

  const { inicio, fim } = intervaloDoMes(mes);
  const grupos = gastoPorGrupo(doMes, inicio, fim);
  const recorrente = grupos.fixo + grupos.variavel;

  return {
    mes,
    total,
    quantidade: doMes.length,
    media: doMes.length > 0 ? Math.round(total / doMes.length) : 0,
    porCategoria: agrupar(
      doMes,
      (c) => c.categoria,
      total,
      totaisPor(anteriores, (c) => c.categoria),
    ),
    porFormaPagamento: agrupar(doMes, (c) => c.formaPagamento, total),
    porConta:
      contas.length > 0
        ? agrupar(doMes, (c) => acharConta(contas, c.contaId)?.apelido ?? '', total)
        : [],
    totalAnterior,
    variacao: totalAnterior === null ? null : total - totalAnterior,
    recorrente,
    tipico,
    comparadoAoTipico: tipico === null || tipico <= 0 ? null : recorrente - tipico,
    maiorCompra,
  };
}
