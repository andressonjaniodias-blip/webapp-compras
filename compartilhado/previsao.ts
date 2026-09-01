/**
 * A previsao e o simulador — o motivo pelo qual o resto deste diretorio existe.
 *
 * O app registrava o passado. Isto responde "posso comprar isto?" antes da
 * compra, e "quando eu consigo comprar aquilo?" para o que ainda nao cabe.
 *
 * DUAS NATUREZAS QUE NUNCA SE MISTURAM numa linha so:
 *
 *   comprometido  parcelas ja contratadas e reserva de meta. E certo.
 *   estimado      o gasto corrente que se repete sem estar contratado. E
 *                 palpite, e a tela diz que e.
 *
 * Juntar os dois faria a previsao parecer mais precisa do que e, e previsao cuja
 * premissa nao da para ver nem corrigir nao e usada duas vezes.
 *
 * COMO O ESTIMADO EVITA CONTAR DUAS VEZES — a sutileza que faz a conta fechar:
 *
 * O estimado e a media dos MESES COMPLETOS ANTERIORES, e essa media ja inclui a
 * primeira parcela das compras feitas naqueles meses. Entao, de uma compra
 * antiga, o `comprometido` conta so as parcelas de indice > 1 — a primeira ja
 * esta dentro do mes tipico, e somar de novo inflaria o futuro.
 *
 * De uma compra feita NESTE mes contam todas, inclusive a primeira: o mes
 * corrente nao entra em media nenhuma, justamente por estar pela metade. E o que
 * faz o simulador pesar uma compra hipotetica por inteiro, em vez de dizer que
 * cabe uma compra que consome o mes.
 *
 * Categoria `eventual` fica de fora do estimado. Sem isso, uma geladeira de
 * R$ 1.200 comprada em agosto faria o app prever R$ 400 a mais TODO MES, para
 * sempre — o app viraria pessimista permanente por causa de uma compra unica.
 *
 * O simulador compara duas projecoes feitas do mesmo jeito, entao qualquer viés
 * sistematico do modelo se cancela na comparacao: o "antes x depois" e mais
 * confiavel do que qualquer numero absoluto isolado.
 */

import {
  acharConta,
  calcularCarteira,
  entradasEntre,
  gastoPorGrupo,
  mesesCompletosAntes,
  parcelasDoCartao,
  pagamentosDe,
  presumidoAteDaDivida,
  presumidoAteDoCartao,
  type Carteira,
  type DadosFinanceiros,
} from './carteira';
import {
  chaveDoMes,
  competenciaDe,
  diasNoMes,
  distanciaEmMeses,
  intervaloDoMes,
  partesDaChave,
  somarMeses,
  vencimentoDe,
  diasAtePagar,
} from './fatura';
import {
  parcelasDaCompra,
  parcelasDaDivida,
  porCompetencia,
  valorDaParcela,
} from './parcelamento';
import { naoExcluido, novoUuid, type Compra, type Meta } from './tipos';

/** Quantos meses completos entram na media do gasto corrente. */
export const MESES_DE_HISTORICO = 3;

// ------------------------------------------------------- gasto corrente

export interface Estimativa {
  fixo: number;
  variavel: number;
  /** `fixo + variavel`. O eventual nao e projetado, de proposito. */
  total: number;
  /** Quantos meses completos tinham alguma compra. 0 = sem base nenhuma. */
  mesesUsados: number;
  /** Menos de dois meses de historico e chute, e a tela precisa dizer isso. */
  fraca: boolean;
  /** `true` quando o usuario digitou o proprio numero. */
  manual: boolean;
}

/**
 * Quanto costuma sair por mes, sem contar o que ja esta contratado.
 *
 * Media dos meses completos anteriores — o mes em curso esta pela metade e
 * puxaria a media para baixo. Transferencias ficam de fora: pagamento de fatura
 * nao e gasto novo, e conta-lo aqui somaria com o comprometido.
 */
export function estimarGastoCorrente(
  dados: DadosFinanceiros,
  agora: number,
  sobrescrito?: number | null,
): Estimativa {
  if (sobrescrito !== undefined && sobrescrito !== null && sobrescrito >= 0) {
    return {
      fixo: 0,
      variavel: sobrescrito,
      total: sobrescrito,
      mesesUsados: MESES_DE_HISTORICO,
      fraca: false,
      manual: true,
    };
  }

  const meses = mesesCompletosAntes(agora, MESES_DE_HISTORICO);
  let fixo = 0;
  let variavel = 0;
  let usados = 0;

  for (const mes of meses) {
    const { inicio, fim } = intervaloDoMes(mes);
    const grupos = gastoPorGrupo(dados.compras, inicio, fim);
    if (grupos.fixo + grupos.variavel + grupos.eventual > 0) usados += 1;
    fixo += grupos.fixo;
    variavel += grupos.variavel;
  }

  const divisor = Math.max(1, usados);
  const mediaFixo = Math.round(fixo / divisor);
  const mediaVariavel = Math.round(variavel / divisor);

  return {
    fixo: mediaFixo,
    variavel: mediaVariavel,
    total: mediaFixo + mediaVariavel,
    mesesUsados: usados,
    fraca: usados < 2,
    manual: false,
  };
}

// ------------------------------------------------------------- projecao

export interface LinhaPrevisao {
  mes: string;
  /** Centavos que entram no mes. No mes corrente, so o que ainda falta entrar. */
  entradas: number;
  /** Parcelas de indice > 1, parcelas de divida e faturas ainda em aberto. */
  comprometido: number;
  reservaMetas: number;
  estimado: number;
  /** entradas - comprometido - reservaMetas - estimado. */
  sobra: number;
  /** Saldo em conta ao fim do mes, acumulando as sobras. */
  saldoAcumulado: number;
  /** O mes corrente e parcial: o estimado dele e proporcional aos dias que faltam. */
  parcial: boolean;
}

export interface OpcoesPrevisao {
  meses: number;
  agora: number;
  /** Gasto corrente digitado pelo usuario, em centavos. */
  gastoManual?: number | null;
}

/**
 * A projecao mes a mes.
 *
 * Comeca no mes CORRENTE, tratado como parcial: o saldo de partida ja reflete o
 * que aconteceu ate hoje, entao aqui entram apenas as entradas que ainda vao
 * cair, os compromissos ainda nao pagos e o gasto estimado proporcional aos dias
 * que faltam. Somar o mes inteiro de novo contaria o que ja passou duas vezes.
 */
export function projetar(dados: DadosFinanceiros, opcoes: OpcoesPrevisao): LinhaPrevisao[] {
  const { agora } = opcoes;
  const carteira = calcularCarteira(dados, agora);
  const estimativa = estimarGastoCorrente(dados, agora, opcoes.gastoManual);
  const reserva = reservaMensalDeMetas(dados.metas);
  const compromissosPorMes = comprometidoPorMes(dados, agora);

  const mesAtual = chaveDoMes(agora);
  let saldo = carteira.saldoEmConta;
  const linhas: LinhaPrevisao[] = [];

  for (let n = 0; n < Math.max(1, opcoes.meses); n += 1) {
    const mes = somarMeses(mesAtual, n);
    const { inicio, fim } = intervaloDoMes(mes);
    const parcial = n === 0;

    const desde = parcial ? Math.max(inicio, agora) : inicio;
    const entradas = entradasEntre(dados.rendas, desde, fim);
    const comprometido = compromissosPorMes.get(mes) ?? 0;
    const estimado = parcial
      ? Math.round(estimativa.total * fracaoRestanteDoMes(agora))
      : estimativa.total;

    const sobra = entradas - comprometido - reserva - estimado;
    saldo += sobra;

    linhas.push({
      mes,
      entradas,
      comprometido,
      reservaMetas: reserva,
      estimado,
      sobra,
      saldoAcumulado: saldo,
      parcial,
    });
  }

  return linhas;
}

/** Que fatia do mes ainda falta viver. 1,0 no dia 1; ~0 no ultimo dia. */
function fracaoRestanteDoMes(agora: number): number {
  const d = new Date(agora);
  const total = diasNoMes(d.getFullYear(), d.getMonth());
  return Math.max(0, (total - d.getDate() + 1) / total);
}

/**
 * Quanto ja esta contratado em cada mes futuro.
 *
 * A REGRA SUTIL, e a que faz a conta nao ser contada duas vezes:
 *
 * O gasto estimado e a media dos MESES COMPLETOS ANTERIORES, e essa media ja
 * inclui a primeira parcela das compras feitas naqueles meses. Contar a primeira
 * parcela dessas compras de novo aqui inflaria o futuro.
 *
 * Mas compra feita NESTE mes nao esta em media nenhuma — o mes corrente nao
 * entra no historico justamente porque esta pela metade. Entao dela contam
 * TODAS as parcelas, inclusive a primeira. E a mesma regra que faz o simulador
 * pesar uma compra hipotetica por inteiro: sem isso ele diria que cabe uma
 * compra que consome o mes inteiro, que e o erro mais caro que esta tela pode
 * cometer.
 *
 * Divida: todas as parcelas sempre, porque nenhuma delas aparece no historico de
 * compras. Pagamento ja feito abate.
 */
function comprometidoPorMes(dados: DadosFinanceiros, agora: number): Map<string, number> {
  const mapa = new Map<string, number>();
  const somar = (mes: string, valor: number) => {
    if (valor <= 0) return;
    mapa.set(mes, (mapa.get(mes) ?? 0) + valor);
  };
  const mesAtual = chaveDoMes(agora);

  for (const conta of dados.contas) {
    if (!naoExcluido(conta) || conta.tipo !== 'credito') continue;
    const todas = parcelasDoCartao(conta, dados.compras);

    const dataDaCompra = new Map(dados.compras.map((compra) => [compra.id, compra.data]));
    const contam = todas.filter((parcela) => {
      if (parcela.indice > 1) return true;
      const quando = dataDaCompra.get(parcela.fonteId);
      return quando === undefined || chaveDoMes(quando) >= mesAtual;
    });

    const ciclos = porCompetencia(
      todas,
      pagamentosDe(dados.transferencias, 'cartao', conta.id),
      presumidoAteDoCartao(agora),
    );
    const pagoPorMes = new Map(ciclos.map((c) => [c.competencia, c.pago]));

    const porMes = new Map<string, number>();
    for (const parcela of contam) {
      porMes.set(parcela.competencia, (porMes.get(parcela.competencia) ?? 0) + parcela.valor);
    }

    for (const [mes, valor] of porMes) {
      if (mes < mesAtual) continue;
      somar(mes, Math.max(0, valor - (pagoPorMes.get(mes) ?? 0)));
    }
  }

  for (const divida of dados.dividas) {
    if (!naoExcluido(divida)) continue;
    // A presuncao entra aqui tambem, e nao so na Carteira: sem ela, o
    // consignado ja retido no contracheque deste mes apareceria como
    // compromisso a pagar, e a sobra do mes sairia menor do que e.
    const ciclos = porCompetencia(
      parcelasDaDivida(divida),
      pagamentosDe(dados.transferencias, 'divida', divida.id),
      presumidoAteDaDivida(divida, dados, agora),
    );
    for (const ciclo of ciclos) {
      if (ciclo.competencia < mesAtual) continue;
      somar(ciclo.competencia, ciclo.restante);
    }
  }

  return mapa;
}

/** Quanto as metas ativas pedem por mes. */
export function reservaMensalDeMetas(metas: readonly Meta[]): number {
  return metas
    .filter((meta) => naoExcluido(meta) && meta.guardado < meta.valorAlvo)
    .reduce((soma, meta) => soma + Math.max(0, meta.reservaMensal), 0);
}

// ------------------------------------------------------------ simulador

export interface Hipotese {
  /** Centavos. */
  valor: number;
  /** `null` = a vista, sai da conta na hora. */
  contaId: string | null;
  parcelas: number;
  data: number;
  categoria: string;
}

export type Veredito = 'cabe' | 'aperta' | 'estoura';

export interface Simulacao {
  antes: LinhaPrevisao[];
  depois: LinhaPrevisao[];
  /** Centavos de cada parcela (a primeira, que absorve o resto). */
  parcela: number;
  parcelas: number;
  competenciaInicial: string | null;
  /** Competencia da ULTIMA parcela. Nao confundir com o fim da projecao. */
  competenciaFinal: string | null;
  vencimentoEm: number | null;
  diasAtePagar: number | null;
  /**
   * Fatia do limite do cartao que a compra passa a ocupar. `null` quando o
   * cartao nao tem limite informado.
   *
   * NAO e limitado a 1: acima disso a compra simplesmente nao passa na maquina, e
   * arredondar para "100%" esconderia o fato mais importante da tela.
   */
  usoDoLimite: number | null;
  /** Centavos que faltam de limite. 0 quando cabe. */
  faltaDeLimite: number;
  mesMaisApertado: LinhaPrevisao | null;
  /** Meses que ficam negativos DEPOIS da compra. */
  mesesNegativos: LinhaPrevisao[];
  /** Quantos meses ficam apertados depois da compra e nao estavam antes. */
  apertosNovos: number;
  veredito: Veredito;
  metasAtrasadas: { descricao: string; atrasoEmMeses: number }[];
}

/**
 * Uma compra hipotetica jogada em cima da projecao.
 *
 * Nao grava nada: monta uma compra em memoria, projeta de novo e compara. E o
 * que permite usar isto na frente da prateleira sem medo de sujar o historico.
 */
export function simular(
  dados: DadosFinanceiros,
  hipotese: Hipotese,
  opcoes: OpcoesPrevisao,
): Simulacao {
  const antes = projetar(dados, opcoes);

  const compra: Compra = {
    id: novoUuid(),
    data: hipotese.data,
    descricao: 'Simulação',
    categoria: hipotese.categoria,
    formaPagamento: '',
    observacao: '',
    totalManual: hipotese.valor,
    total: hipotese.valor,
    qtdItens: 0,
    contaId: hipotese.contaId,
    parcelas: Math.max(1, Math.floor(hipotese.parcelas)),
    atualizadoEm: hipotese.data,
    excluidoEm: null,
  };

  const comA = { ...dados, compras: [...dados.compras, compra] };
  const depois = projetar(comA, opcoes);

  const conta = acharConta(dados.contas, hipotese.contaId);
  const noCredito = conta?.tipo === 'credito';
  const vezes = compra.parcelas;

  const competenciaInicial = noCredito ? competenciaDe(conta, hipotese.data) : null;
  const competenciaFinal = competenciaInicial ? somarMeses(competenciaInicial, vezes - 1) : null;
  const vencimentoEm = competenciaInicial ? vencimentoDe(conta!, competenciaInicial) : null;

  const folga = Math.round(
    estimarGastoCorrente(dados, opcoes.agora, opcoes.gastoManual).total / 2,
  );

  const apertadosAntes = antes.filter((linha) => linha.saldoAcumulado < folga).length;
  const apertadosDepois = depois.filter((linha) => linha.saldoAcumulado < folga);
  const negativos = depois.filter((linha) => linha.saldoAcumulado < 0);

  const maisApertado = depois.reduce<LinhaPrevisao | null>(
    (pior, linha) => (pior === null || linha.saldoAcumulado < pior.saldoAcumulado ? linha : pior),
    null,
  );

  let usoDoLimite: number | null = null;
  let faltaDeLimite = 0;
  if (noCredito && conta && conta.limite > 0) {
    const usadoAgora = porCompetencia(
      parcelasDoCartao(conta, dados.compras),
      pagamentosDe(dados.transferencias, 'cartao', conta.id),
      presumidoAteDoCartao(hipotese.data),
    ).reduce((soma, ciclo) => soma + ciclo.restante, 0);
    const comprometido = usadoAgora + hipotese.valor;
    usoDoLimite = comprometido / conta.limite;
    faltaDeLimite = Math.max(0, comprometido - conta.limite);
  }

  return {
    antes,
    depois,
    parcela: valorDaParcela(hipotese.valor, vezes, 1),
    parcelas: vezes,
    competenciaInicial,
    competenciaFinal,
    vencimentoEm,
    diasAtePagar: noCredito && conta ? diasAtePagar(conta, hipotese.data) : null,
    usoDoLimite,
    faltaDeLimite,
    mesMaisApertado: maisApertado,
    mesesNegativos: negativos,
    apertosNovos: Math.max(0, apertadosDepois.length - apertadosAntes),
    veredito: negativos.length > 0 ? 'estoura' : apertadosDepois.length > apertadosAntes ? 'aperta' : 'cabe',
    metasAtrasadas: atrasoNasMetas(dados, antes, depois),
  };
}

/**
 * Quanto cada meta atrasa por causa da compra.
 *
 * Nao e adivinhacao: a meta e alimentada pela sobra, entao menos sobra por mes e
 * literalmente mais meses ate juntar o valor.
 */
function atrasoNasMetas(
  dados: DadosFinanceiros,
  antes: readonly LinhaPrevisao[],
  depois: readonly LinhaPrevisao[],
): { descricao: string; atrasoEmMeses: number }[] {
  const sobraAntes = sobraMediaMensal(antes);
  const sobraDepois = sobraMediaMensal(depois);
  if (sobraAntes <= 0) return [];

  const saida: { descricao: string; atrasoEmMeses: number }[] = [];
  for (const meta of dados.metas) {
    if (!naoExcluido(meta) || meta.guardado >= meta.valorAlvo) continue;
    const falta = meta.valorAlvo - meta.guardado;
    const ritmoAntes = meta.reservaMensal > 0 ? meta.reservaMensal : sobraAntes;
    const ritmoDepois = meta.reservaMensal > 0 ? meta.reservaMensal : Math.max(0, sobraDepois);
    if (ritmoDepois <= 0) {
      saida.push({ descricao: meta.descricao, atrasoEmMeses: Infinity });
      continue;
    }
    const atraso = Math.ceil(falta / ritmoDepois) - Math.ceil(falta / ritmoAntes);
    if (atraso > 0) saida.push({ descricao: meta.descricao, atrasoEmMeses: atraso });
  }
  return saida;
}

function sobraMediaMensal(linhas: readonly LinhaPrevisao[]): number {
  const cheios = linhas.filter((linha) => !linha.parcial);
  if (cheios.length === 0) return 0;
  return Math.round(cheios.reduce((soma, linha) => soma + linha.sobra, 0) / cheios.length);
}

// ---------------------------------------------------------------- metas

export interface PlanoDaMeta {
  meta: Meta;
  falta: number;
  /** 0 a 1. */
  progresso: number;
  /** Centavos por mes que a meta consome hoje. */
  reservaAtual: number;
  /** Em quantos meses chega, no ritmo atual. `null` quando o ritmo e zero. */
  mesesAteAlcancar: number | null;
  /** Competencia estimada de conclusao. */
  competenciaAlvo: string | null;
  /** Com prazo definido: quanto seria preciso guardar por mes. */
  reservaNecessaria: number | null;
  /** A reserva necessaria cabe na sobra prevista? */
  cabeNaSobra: boolean | null;
}

/**
 * A conta da meta, nos dois sentidos.
 *
 * Com reserva definida, responde "quando chego". Com prazo definido, responde
 * "quanto preciso guardar". Sao a mesma equacao resolvida para variaveis
 * diferentes, e e isso que transforma um desejo em orçamento.
 */
export function planejarMeta(
  meta: Meta,
  sobraMensal: number,
  agora: number,
): PlanoDaMeta {
  const falta = Math.max(0, meta.valorAlvo - meta.guardado);
  const progresso = meta.valorAlvo > 0 ? Math.min(1, meta.guardado / meta.valorAlvo) : 1;
  const reservaAtual = meta.reservaMensal > 0 ? meta.reservaMensal : Math.max(0, sobraMensal);

  const mesesAteAlcancar = falta === 0 ? 0 : reservaAtual > 0 ? Math.ceil(falta / reservaAtual) : null;
  const competenciaAlvo =
    mesesAteAlcancar === null ? null : somarMeses(chaveDoMes(agora), mesesAteAlcancar);

  let reservaNecessaria: number | null = null;
  let cabeNaSobra: boolean | null = null;
  if (meta.prazoEm !== null && falta > 0) {
    const meses = Math.max(1, distanciaEmMeses(chaveDoMes(agora), chaveDoMes(meta.prazoEm)));
    reservaNecessaria = Math.ceil(falta / meses);
    cabeNaSobra = reservaNecessaria <= Math.max(0, sobraMensal);
  }

  return {
    meta,
    falta,
    progresso,
    reservaAtual,
    mesesAteAlcancar,
    competenciaAlvo,
    reservaNecessaria,
    cabeNaSobra,
  };
}

/** Quantos meses ate a meta mais longa, para a projecao esticar ate la. */
export function mesesAteAMetaMaisLonga(metas: readonly Meta[], agora: number): number {
  let maior = 0;
  for (const meta of metas) {
    if (!naoExcluido(meta) || meta.prazoEm === null) continue;
    maior = Math.max(maior, distanciaEmMeses(chaveDoMes(agora), chaveDoMes(meta.prazoEm)));
  }
  return maior;
}

// --------------------------------------------------------------- resumo

export interface Panorama {
  carteira: Carteira;
  estimativa: Estimativa;
  linhas: LinhaPrevisao[];
  /** A linha de menor saldo acumulado — o mes em que a corda estica. */
  mesMaisApertado: LinhaPrevisao | null;
  /** Sobra prevista do mes corrente. */
  sobraDoMes: number;
}

/** O que a tela inicial e a Carteira mostram, numa chamada so. */
export function panorama(dados: DadosFinanceiros, opcoes: OpcoesPrevisao): Panorama {
  const linhas = projetar(dados, opcoes);
  const futuros = linhas.filter((linha) => !linha.parcial);
  const alvo = futuros.length > 0 ? futuros : linhas;

  return {
    carteira: calcularCarteira(dados, opcoes.agora),
    estimativa: estimarGastoCorrente(dados, opcoes.agora, opcoes.gastoManual),
    linhas,
    mesMaisApertado: alvo.reduce<LinhaPrevisao | null>(
      (pior, linha) => (pior === null || linha.saldoAcumulado < pior.saldoAcumulado ? linha : pior),
      null,
    ),
    sobraDoMes: linhas[0]?.sobra ?? 0,
  };
}

/** Usado so pela tela de compra, para dizer em que fatura a compra vai cair. */
export function previaDaCompra(compra: Compra, dados: DadosFinanceiros) {
  const conta = acharConta(dados.contas, compra.contaId);
  if (!conta || conta.tipo !== 'credito') return null;

  const parcelas = parcelasDaCompra(compra, conta);
  if (parcelas.length === 0) return null;

  return {
    conta,
    parcelas,
    primeira: parcelas[0]!,
    ultima: parcelas[parcelas.length - 1]!,
    diasAtePagar: diasAtePagar(conta, compra.data),
  };
}

/** Reexportado para as telas nao precisarem importar de dois lugares. */
export { partesDaChave };
