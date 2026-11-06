/**
 * O orcamento anual, no estilo da LOA: um teto por categoria para o ano todo,
 * gerado como proposta, ajustado pelo usuario, confirmado e acompanhado.
 *
 * Este arquivo existe para que CADA numero do orcamento tenha uma funcao so, e
 * as telas, o painel e o servidor (que monta o prompt da IA) leiam dela — e nao
 * facam conta propria. Foi assim que o app chegou a quatro numeros chamados
 * "sobra" (invariante 9). A IA comenta e sugere; nenhum limite nasce dela.
 *
 * O que conta como "gasto da categoria": `compra.total` INTEIRO, na `compra.data`,
 * ignorando excluidas — a mesma base de `gastoPorGrupo` e `resumirMes`. Compra no
 * credito pesa na data da compra, nao nas parcelas; fatura paga, parcela de
 * divida e transferencia nunca entram (invariante 10). Misturar com caixa
 * contaria o mesmo gasto duas vezes.
 *
 * Funcoes puras, sem Dexie: rodam no aparelho e no servidor.
 */

import { MACROCATEGORIAS, macrocategoriaDe } from './constantes';
import { chaveDoMes, intervaloDoMes, partesDaChave, somarMeses } from './fatura';
import { mesesCompletosAntes, type DadosFinanceiros } from './carteira';
import {
  comprometidoPorMes,
  estimarEntradaMensal,
  reservaMensalDeMetas,
  temBaseDeEntrada,
} from './previsao';
import {
  naoExcluido,
  type Compra,
  type LinhaOrcamento,
  type Orcamento,
} from './tipos';

/** Meses completos de uso que abrem o recurso. Antes disso nao ha base. */
export const MESES_MINIMOS = 3;

/** Em quais marcos de uso o app avisa que o orcamento pode ser atualizado. */
export const MARCOS_DE_ATUALIZACAO = [6, 12] as const;

/** Quantos meses completos a proposta olha para tras. */
const MESES_DA_PROPOSTA = 12;

/** A categoria de compra sem categoria, igual a do Resumo. */
export const SEM_CATEGORIA = 'Sem definição';

/** O ponto em que o gasto de uma categoria passa a "apertar" (85% do teto). */
const LIMIAR_DE_APERTO_PERCENTUAL = 85;

const categoriaDe = (compra: Compra) => compra.categoria.trim() || SEM_CATEGORIA;

// ------------------------------------------------------------ tempo de uso

/**
 * Quantos meses completos tem ao menos uma compra lancada.
 *
 * O mes corrente nao conta (esta pela metade) e mes sem compra tambem nao: o
 * que importa e quanto o usuario ja alimentou o app, e nao quanto tempo passou.
 */
export function mesesDeUso(compras: readonly Compra[], agora: number): number {
  const atual = chaveDoMes(agora);
  const meses = new Set<string>();
  for (const compra of compras) {
    if (!naoExcluido(compra)) continue;
    const mes = chaveDoMes(compra.data);
    if (mes < atual) meses.add(mes);
  }
  return meses.size;
}

/** Ha base para propor? So a partir de `MESES_MINIMOS` meses de uso. */
export function orcamentoLiberado(meses: number): boolean {
  return meses >= MESES_MINIMOS;
}

/** O maior marco de uso atingido: 0 (abaixo do minimo), 3, 6 ou 12. */
export function marcoAtingido(meses: number): 0 | 3 | 6 | 12 {
  if (meses >= 12) return 12;
  if (meses >= 6) return 6;
  if (meses >= MESES_MINIMOS) return 3;
  return 0;
}

/**
 * O aviso "ja ha mais historico, quer atualizar?", ou `null`.
 *
 * So aparece quando o uso atual passou de um marco (6 ou 12) maior que o da hora
 * em que a proposta foi feita E maior que o que o usuario ja dispensou. Nada
 * muda sozinho: quem decide e ele.
 */
export function avisoDeAtualizacao(
  orcamento: Pick<Orcamento, 'mesesDeBase' | 'marcoDispensado'>,
  mesesAgora: number,
): 6 | 12 | null {
  const agora = marcoAtingido(mesesAgora);
  if (agora !== 6 && agora !== 12) return null;
  if (agora <= marcoAtingido(orcamento.mesesDeBase)) return null;
  if (agora <= orcamento.marcoDispensado) return null;
  return agora;
}

// ----------------------------------------------------------------- proposta

export interface Proposta {
  linhas: LinhaOrcamento[];
  /** Meses completos (dos ultimos 12) que tinham alguma compra. */
  mesesDeHistorico: number;
}

/** Quantos meses do ano `ano` ainda faltam, contando o corrente. */
function mesesAFrente(ano: number, agora: number): number {
  const hoje = partesDaChave(chaveDoMes(agora));
  if (ano < hoje.ano) return 0;
  if (ano > hoje.ano) return 12;
  return 12 - hoje.mes;
}

function totaisPorCategoria(
  compras: readonly Compra[],
  inicio: number,
  fim: number,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const compra of compras) {
    if (!naoExcluido(compra) || compra.data < inicio || compra.data > fim) continue;
    const categoria = categoriaDe(compra);
    mapa.set(categoria, (mapa.get(categoria) ?? 0) + compra.total);
  }
  return mapa;
}

/**
 * A proposta de teto anual por categoria.
 *
 * Base: os ultimos 12 meses completos. A media mensal usa o mesmo divisor do
 * gasto tipico (`estimarGastoCorrente`): so os meses que tiveram alguma compra,
 * senao quem comecou a usar ha 4 meses teria um orcamento 3x menor que o real.
 * Soma-se tudo antes de dividir, para categoria eventual (presentes, saude) nao
 * sumir da proposta por ter caido num mes so.
 *
 * - Ano futuro: media x 12.
 * - Ano corrente: o que ja foi gasto nos meses completos do ano + media x os
 *   meses que faltam (o corrente incluido).
 * - Ano passado: nao ha o que propor.
 *
 * Quem chama garante `orcamentoLiberado`; sem historico a lista vem vazia
 * (Principio 0: nao se chuta numero sem base).
 */
export function propor(compras: readonly Compra[], ano: number, agora: number): Proposta {
  const vazio: Proposta = { linhas: [], mesesDeHistorico: 0 };
  const hoje = partesDaChave(chaveDoMes(agora));
  if (ano < hoje.ano) return vazio;

  const janela = mesesCompletosAntes(agora, MESES_DA_PROPOSTA);
  const somas = new Map<string, number>();
  let usados = 0;
  for (const mes of janela) {
    const { inicio, fim } = intervaloDoMes(mes);
    const doMes = totaisPorCategoria(compras, inicio, fim);
    if (doMes.size > 0) usados += 1;
    for (const [categoria, valor] of doMes) {
      somas.set(categoria, (somas.get(categoria) ?? 0) + valor);
    }
  }
  if (usados === 0) return vazio;

  // Ano corrente: o realizado dos meses completos do ano, ja contado.
  let realizado = new Map<string, number>();
  let mesesRestantes = 12;
  if (ano === hoje.ano) {
    const inicioDoAno = intervaloDoMes(`${ano}-01`).inicio;
    const fimDoUltimoCompleto = intervaloDoMes(somarMeses(chaveDoMes(agora), -1)).fim;
    realizado = hoje.mes === 0 ? new Map() : totaisPorCategoria(compras, inicioDoAno, fimDoUltimoCompleto);
    mesesRestantes = 12 - hoje.mes;
  }

  const categorias = new Set([...somas.keys(), ...realizado.keys()]);
  const linhas: LinhaOrcamento[] = [];
  for (const categoria of categorias) {
    const aFrente = Math.round(((somas.get(categoria) ?? 0) / usados) * mesesRestantes);
    const valor = (realizado.get(categoria) ?? 0) + aFrente;
    if (valor <= 0) continue;
    linhas.push({ categoria, valorAnual: valor, proposto: valor, original: null });
  }
  linhas.sort((a, b) => b.valorAnual - a.valorAnual || a.categoria.localeCompare(b.categoria));
  return { linhas, mesesDeHistorico: usados };
}

export interface PropostaAtualizada {
  /** As linhas de antes, com `proposto` recalculado. `valorAnual` e `original` intactos. */
  linhas: LinhaOrcamento[];
  /** Categorias que a nova proposta tem e o orcamento nao: o usuario decide se inclui. */
  novas: LinhaOrcamento[];
  mesesDeHistorico: number;
}

/**
 * Recalcula a proposta com o historico de agora, SEM mexer em teto nenhum.
 *
 * So o `proposto` muda; a tela mostra "nova proposta R$ X" e o usuario aplica
 * onde quiser. Um orcamento confirmado nao pode mudar sozinho: o teto e uma
 * decisao dele. Categoria que sumiu do historico fica com `proposto` 0.
 */
export function atualizarProposta(
  linhas: readonly LinhaOrcamento[],
  compras: readonly Compra[],
  ano: number,
  agora: number,
): PropostaAtualizada {
  const nova = propor(compras, ano, agora);
  const porCategoria = new Map(nova.linhas.map((l) => [l.categoria, l.valorAnual]));
  const existentes = new Set(linhas.map((l) => l.categoria));
  return {
    linhas: linhas.map((l) => ({ ...l, proposto: porCategoria.get(l.categoria) ?? 0 })),
    novas: nova.linhas.filter((l) => !existentes.has(l.categoria)),
    mesesDeHistorico: nova.mesesDeHistorico,
  };
}

// --------------------------------------------------------------- execucao

export type EstadoDoLimite = 'cabe' | 'aperta' | 'estoura';

export interface LinhaExecutada {
  categoria: string;
  /** O teto do ano. */
  teto: number;
  gastoNoAno: number;
  gastoNoMes: number;
  /** `teto - gastoNoAno`, sem passar de 0: quanto ainda cabe. */
  restante: number;
  /** O que passou do teto, em centavos. 0 quando cabe. */
  estourou: number;
  /** Quanto da para gastar por mes nos meses que faltam, para chegar no teto. */
  ritmoPorMes: number;
  estado: EstadoDoLimite;
  /** O `original` da confirmacao, quando o teto foi ajustado depois dela. */
  ajustadoDe: number | null;
}

export interface ForaDoOrcamento {
  categoria: string;
  gastoNoAno: number;
  gastoNoMes: number;
}

/**
 * A media mensal de um teto anual. Floor, e nao round: e o limite de janeiro
 * (`executarMes`), e os 12 limites somados nunca podem passar do teto.
 */
export function mediaMensal(tetoAnual: number): number {
  return Math.floor(tetoAnual / 12);
}

/**
 * Agrupa por macrocategoria, na ordem de `MACROCATEGORIAS`, sem blocos vazios.
 * Categoria fora do mapa cai em "Outros" (ver `macrocategoriaDe`).
 */
function agrupar<T extends { categoria: string }>(itens: readonly T[]): { macro: string; itens: T[] }[] {
  const porMacro = new Map<string, T[]>();
  for (const item of itens) {
    const macro = macrocategoriaDe(item.categoria);
    porMacro.set(macro, [...(porMacro.get(macro) ?? []), item]);
  }
  return MACROCATEGORIAS.filter((m) => porMacro.has(m.nome)).map((m) => ({
    macro: m.nome,
    itens: porMacro.get(m.nome)!,
  }));
}

const somar = (valores: readonly number[]) => valores.reduce((total, v) => total + v, 0);

/** A soma dos tetos de cada macrocategoria, para a lista do rascunho. */
export function somaPorMacro(
  linhas: readonly LinhaOrcamento[],
): { macro: string; linhas: LinhaOrcamento[]; teto: number }[] {
  return agrupar(linhas).map(({ macro, itens }) => ({
    macro,
    linhas: itens,
    teto: somar(itens.map((l) => l.valorAnual)),
  }));
}

/** Uma macrocategoria na visao ANUAL: as subcategorias e a soma delas. */
export interface MacroExecutada {
  macro: string;
  linhas: LinhaExecutada[];
  teto: number;
  gastoNoAno: number;
  restante: number;
  estourou: number;
  estado: EstadoDoLimite;
}

export interface Execucao {
  linhas: LinhaExecutada[];
  macros: MacroExecutada[];
  fora: ForaDoOrcamento[];
  totalDosTetos: number;
  /** Gasto das categorias que tem teto. */
  gastoNoAno: number;
  gastoNoMes: number;
  /** Gasto das categorias sem teto. */
  gastoForaNoAno: number;
  /** Soma dos `restante`: quanto ainda cabe nos tetos. */
  restante: number;
  /** Meses que faltam no ano, o corrente incluido. 0 num ano que ja passou. */
  mesesQueFaltam: number;
}

export function estadoDoLimite(gasto: number, teto: number): EstadoDoLimite {
  if (gasto > teto) return 'estoura';
  if (teto > 0 && gasto * 100 >= teto * LIMIAR_DE_APERTO_PERCENTUAL) return 'aperta';
  return 'cabe';
}

/**
 * O realizado contra o teto, categoria a categoria.
 *
 * `mesDeReferencia` ("2026-11") so escolhe qual mes aparece em `gastoNoMes`; o
 * teto e anual e `gastoNoAno` e sempre o ano inteiro ate agora.
 */
export function executar(
  compras: readonly Compra[],
  orcamento: Pick<Orcamento, 'ano' | 'linhas'>,
  mesDeReferencia: string,
  agora: number,
): Execucao {
  const { ano } = orcamento;
  const noAno = totaisPorCategoria(
    compras,
    intervaloDoMes(`${ano}-01`).inicio,
    intervaloDoMes(`${ano}-12`).fim,
  );
  const intervaloRef = intervaloDoMes(mesDeReferencia);
  const noMes = totaisPorCategoria(compras, intervaloRef.inicio, intervaloRef.fim);
  const faltam = mesesAFrente(ano, agora);

  const linhas: LinhaExecutada[] = orcamento.linhas.map((linha) => {
    const gastoNoAno = noAno.get(linha.categoria) ?? 0;
    const restante = Math.max(0, linha.valorAnual - gastoNoAno);
    return {
      categoria: linha.categoria,
      teto: linha.valorAnual,
      gastoNoAno,
      gastoNoMes: noMes.get(linha.categoria) ?? 0,
      restante,
      estourou: Math.max(0, gastoNoAno - linha.valorAnual),
      ritmoPorMes: faltam > 0 ? Math.floor(restante / faltam) : 0,
      estado: estadoDoLimite(gastoNoAno, linha.valorAnual),
      ajustadoDe:
        linha.original !== null && linha.original !== linha.valorAnual ? linha.original : null,
    };
  });

  const comTeto = new Set(orcamento.linhas.map((l) => l.categoria));
  const fora: ForaDoOrcamento[] = [];
  for (const [categoria, gastoNoAno] of noAno) {
    if (comTeto.has(categoria)) continue;
    fora.push({ categoria, gastoNoAno, gastoNoMes: noMes.get(categoria) ?? 0 });
  }
  fora.sort((a, b) => b.gastoNoAno - a.gastoNoAno);

  const soma = (valores: number[]) => somar(valores);
  const macros: MacroExecutada[] = agrupar(linhas).map(({ macro, itens }) => {
    const teto = soma(itens.map((l) => l.teto));
    const gastoNoAno = soma(itens.map((l) => l.gastoNoAno));
    return {
      macro,
      linhas: itens,
      teto,
      gastoNoAno,
      restante: soma(itens.map((l) => l.restante)),
      estourou: Math.max(0, gastoNoAno - teto),
      estado: estadoDoLimite(gastoNoAno, teto),
    };
  });
  return {
    linhas,
    macros,
    fora,
    totalDosTetos: soma(linhas.map((l) => l.teto)),
    gastoNoAno: soma(linhas.map((l) => l.gastoNoAno)),
    gastoNoMes: soma(linhas.map((l) => l.gastoNoMes)),
    gastoForaNoAno: soma(fora.map((f) => f.gastoNoAno)),
    restante: soma(linhas.map((l) => l.restante)),
    mesesQueFaltam: faltam,
  };
}

// ------------------------------------------------------------ visao mensal

export interface LinhaDoMes {
  categoria: string;
  /** O teto anual, para a tela poder dizer "de um teto de R$ X no ano". */
  teto: number;
  /** O teto anual dividido por 12: o limite de janeiro. */
  media: number;
  /** O que cabe NESTE mes, depois de descontar o que ja foi gasto no ano. */
  limiteDoMes: number;
  /** `limiteDoMes - media`: quanto o gasto dos meses anteriores subiu (+) ou desceu (-) o limite. */
  ajuste: number;
  gastoNoMes: number;
  /** `limiteDoMes - gastoNoMes`, sem passar de 0. */
  restanteDoMes: number;
  /** O que passou do limite do mes. */
  estourou: number;
  estado: EstadoDoLimite;
}

/** Uma macrocategoria na visao MENSAL: as subcategorias e a soma delas. */
export interface MacroDoMes {
  macro: string;
  linhas: LinhaDoMes[];
  limite: number;
  gasto: number;
  restante: number;
  estourou: number;
  estado: EstadoDoLimite;
}

export interface ExecucaoDoMes {
  mes: string;
  linhas: LinhaDoMes[];
  macros: MacroDoMes[];
  /** Categorias com gasto no mes e sem teto. */
  fora: { categoria: string; gastoNoMes: number }[];
  limite: number;
  gasto: number;
  restante: number;
  estourou: number;
  gastoFora: number;
  estado: EstadoDoLimite;
}

/**
 * O limite de CADA mes: a media do teto anual, ajustada pelo que ja foi gasto.
 *
 *   limite do mes = (teto - gasto de janeiro ate o mes anterior) / meses que faltam, contando este
 *
 * Em janeiro e o teto / 12. Quem gastou menos que a media num mes ganha folga no
 * seguinte; quem gastou mais, perde. Passou do teto do ano, o limite e 0. Usa o
 * acumulado do ano, e nao so o mes anterior, de proposito: assim a soma dos 12
 * limites nunca passa do teto, e gastar exatamente o limite todo mes fecha o ano
 * no teto.
 *
 * Mes que ainda nao chegou repete o limite do mes corrente (se cada mes gastar o
 * seu limite, ele continua o mesmo). Ano seguinte, sem gasto nenhum, e teto / 12 em
 * todo mes. Mes passado mostra o limite COMO ERA na epoca, com o que se sabia.
 *
 * Mesmo gasto de `executar` — `compra.total` inteiro na data da compra — so que
 * fatiado por mes.
 */
export function executarMes(
  compras: readonly Compra[],
  orcamento: Pick<Orcamento, 'ano' | 'linhas'>,
  mes: string,
  agora: number,
): ExecucaoDoMes {
  const { ano } = orcamento;
  const hoje = partesDaChave(chaveDoMes(agora));
  const indice = partesDaChave(mes).mes;

  // Ate qual mes o gasto ja "aconteceu". Ano seguinte: nenhum. Ano passado: todos.
  const indiceDeHoje = ano > hoje.ano ? -1 : ano < hoje.ano ? 11 : hoje.mes;
  const base = indiceDeHoje < 0 ? 0 : Math.min(indice, indiceDeHoje);
  const mesesQueFaltam = 12 - base;

  const antes =
    base > 0
      ? totaisPorCategoria(
          compras,
          intervaloDoMes(`${ano}-01`).inicio,
          intervaloDoMes(`${ano}-${String(base).padStart(2, '0')}`).fim,
        )
      : new Map<string, number>();
  const intervalo = intervaloDoMes(mes);
  const noMes = totaisPorCategoria(compras, intervalo.inicio, intervalo.fim);

  const linhas: LinhaDoMes[] = orcamento.linhas.map((linha) => {
    const limiteDoMes = Math.floor(
      Math.max(0, linha.valorAnual - (antes.get(linha.categoria) ?? 0)) / mesesQueFaltam,
    );
    const media = mediaMensal(linha.valorAnual);
    const gastoNoMes = noMes.get(linha.categoria) ?? 0;
    return {
      categoria: linha.categoria,
      teto: linha.valorAnual,
      media,
      limiteDoMes,
      ajuste: limiteDoMes - media,
      gastoNoMes,
      restanteDoMes: Math.max(0, limiteDoMes - gastoNoMes),
      estourou: Math.max(0, gastoNoMes - limiteDoMes),
      estado: estadoDoLimite(gastoNoMes, limiteDoMes),
    };
  });

  const macros: MacroDoMes[] = agrupar(linhas).map(({ macro, itens }) => {
    const limite = somar(itens.map((l) => l.limiteDoMes));
    const gasto = somar(itens.map((l) => l.gastoNoMes));
    return {
      macro,
      linhas: itens,
      limite,
      gasto,
      restante: somar(itens.map((l) => l.restanteDoMes)),
      estourou: Math.max(0, gasto - limite),
      estado: estadoDoLimite(gasto, limite),
    };
  });

  const comTeto = new Set(orcamento.linhas.map((l) => l.categoria));
  const fora = [...noMes]
    .filter(([categoria]) => !comTeto.has(categoria))
    .map(([categoria, gastoNoMes]) => ({ categoria, gastoNoMes }))
    .sort((a, b) => b.gastoNoMes - a.gastoNoMes);

  const limite = somar(linhas.map((l) => l.limiteDoMes));
  const gasto = somar(linhas.map((l) => l.gastoNoMes));
  return {
    mes,
    linhas,
    macros,
    fora,
    limite,
    gasto,
    restante: somar(linhas.map((l) => l.restanteDoMes)),
    estourou: Math.max(0, gasto - limite),
    gastoFora: somar(fora.map((f) => f.gastoNoMes)),
    estado: estadoDoLimite(gasto, limite),
  };
}

// ----------------------------------------------------------------- envelope

export interface FolgaDoOrcamento {
  /** Entrada estimada dos meses que faltam no ano. */
  entradas: number;
  /** O que ainda cabe nos tetos (soma dos `restante`). */
  tetos: number;
  /** Parcelas de emprestimo e financiamento que vencem no ano, daqui para frente. */
  dividas: number;
  /** Reserva das metas nos meses que faltam. */
  metas: number;
  /** `entradas - tetos - dividas - metas`. Negativo = o orcamento nao cabe na renda. */
  folga: number;
  /** A entrada e media dos ultimos meses, nao dado certo. */
  entradaFraca: boolean;
}

/**
 * Cabe na renda? O envelope do orcamento, em UM lugar so.
 *
 * `null` sem base de entrada (invariante 22): sem renda lancada, o numero diria
 * "o orcamento nao cabe" por falta de dado, e nao por falta de dinheiro.
 *
 * Conta so o que FALTA do ano (entradas, tetos que ainda cabem, dividas, metas),
 * para o ano corrente nao misturar o que ja aconteceu com o que vem.
 *
 * O CARTAO fica de fora de proposito: compra no credito ja pesa no teto da
 * categoria, na data da compra, e somar a parcela seria contar duas vezes
 * (invariante 10). O custo e que parcela de compra de ANO ANTERIOR, que cai neste,
 * nao aparece aqui — a tela diz que e estimativa.
 */
export function folgaDoOrcamento(
  dados: DadosFinanceiros,
  orcamento: Pick<Orcamento, 'ano' | 'linhas'>,
  agora: number,
  entradaManual?: number | null,
): FolgaDoOrcamento | null {
  const entrada = estimarEntradaMensal(dados, agora, entradaManual);
  if (!temBaseDeEntrada(entrada)) return null;

  const faltam = mesesAFrente(orcamento.ano, agora);
  const execucao = executar(dados.compras, orcamento, chaveDoMes(agora), agora);

  // Sem as contas de credito, `comprometidoPorMes` devolve so as dividas.
  const semCartao: DadosFinanceiros = {
    ...dados,
    contas: dados.contas.filter((conta) => conta.tipo !== 'credito'),
  };
  let dividas = 0;
  for (const [mes, valor] of comprometidoPorMes(semCartao, agora)) {
    if (mes.startsWith(`${orcamento.ano}-`)) dividas += valor;
  }

  const entradas = entrada.total * faltam;
  const metas = reservaMensalDeMetas(dados.metas) * faltam;
  return {
    entradas,
    tetos: execucao.restante,
    dividas,
    metas,
    folga: entradas - execucao.restante - dividas - metas,
    entradaFraca: entrada.fraca,
  };
}
