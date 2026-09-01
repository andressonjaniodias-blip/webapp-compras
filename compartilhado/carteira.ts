/**
 * Os saldos de hoje: quanto ha em cada conta, quanto falta pagar e quanto sobra.
 *
 * Funcoes puras, sem banco, como `src/lib/resumo.ts`: recebem as listas ja
 * carregadas e devolvem numeros. Ficam em `compartilhado/` porque o servidor usa
 * as mesmas contas para montar o prompt das dicas.
 *
 * A REGRA QUE IMPEDE A CONTAGEM DUPLA, que e o motivo deste arquivo existir:
 *
 * | evento                        | sai do caixa      | e gasto |
 * | compra em debito/pix/dinheiro | sim, na data      | sim     |
 * | compra no credito             | NAO — vira fatura | sim     |
 * | pagamento de fatura/divida    | sim, na data      | NAO     |
 * | saque / transferencia         | muda de bolso     | NAO     |
 *
 * Sem o vinculo `contaId` na compra e `alvoId` no pagamento, registrar as
 * compras do mes E o pagamento da fatura contaria o mesmo dinheiro duas vezes —
 * e o sintoma seria um saldo errado descoberto semanas depois, sem pista.
 *
 * Sobre o SALDO INICIAL: o saldo de uma conta nao da para deduzir do historico
 * de compras, porque falta o dinheiro que ja estava la. O usuario informa uma
 * vez, e daqui para frente so conta o que veio depois. Informar de novo faz
 * valer o mais recente — a leitura se autocorrige em vez de acumular desvio.
 */

import { grupoDaCategoria, type GrupoCategoria } from './constantes';
import {
  chaveDoMes,
  diaDoMesSeguro,
  fechamentoDe,
  intervaloDoMes,
  meiaNoiteDe,
  partesDaChave,
  somarMeses,
  vencimentoDe,
} from './fatura';
import {
  parcelasDaCompra,
  parcelasDaDivida,
  porCompetencia,
  quantoFalta,
  type Ciclo,
  type Falta,
  type Parcela,
} from './parcelamento';
import {
  naoExcluido,
  type Compra,
  type Conta,
  type Divida,
  type Meta,
  type Renda,
  type Transferencia,
} from './tipos';

/** Tudo que as contas precisam. Uma unica forma, usada tambem pela previsao. */
export interface DadosFinanceiros {
  contas: readonly Conta[];
  compras: readonly Compra[];
  rendas: readonly Renda[];
  dividas: readonly Divida[];
  metas: readonly Meta[];
  transferencias: readonly Transferencia[];
}

export const SEM_DADOS: DadosFinanceiros = {
  contas: [],
  compras: [],
  rendas: [],
  dividas: [],
  metas: [],
  transferencias: [],
};

// ------------------------------------------------------------------ rendas

/**
 * Quando esta renda cai, de `data` ate `ate`.
 *
 * Recorrencia mensal e anual sao expandidas aqui, respeitando `encerradoEm`. E
 * assim que o aumento de salario funciona sem reescrever o passado: a renda
 * antiga tem fim, a nova tem inicio, e cada mes pega a que estava valendo.
 *
 * O dia e travado no do lançamento original: salario no dia 31 cai no dia 28 em
 * fevereiro, e nao escorrega para março.
 *
 * O PISO E O DIA, NAO O INSTANTE, e isto corrige um bug que apagava a primeira
 * ocorrencia de TODA renda recorrente recem-criada. A ocorrencia e montada com
 * segundos zerados; `criarRenda` grava `Date.now()`, que tem segundos. Entao a
 * ocorrencia do proprio mes caia uns segundos ANTES de `renda.data` e era
 * descartada — um salario cadastrado hoje sO passava a contar no mes seguinte.
 * A suite nunca viu porque a fabrica de teste monta datas com segundos zerados.
 *
 * O TETO continua sendo o instante, de proposito: a previsao do mes corrente
 * conta o que ainda vai cair e o saldo conta o que ja caiu, e as duas usam
 * `agora` como divisor. Arredondar o teto para o dia faria a mesma parcela ser
 * contada nos dois lados.
 */
export function ocorrenciasDeRenda(renda: Renda, ate: number): number[] {
  if (renda.data > ate) return [];
  const fim = renda.encerradoEm === null ? ate : Math.min(ate, renda.encerradoEm);
  if (renda.data > fim) return [];
  if (renda.periodicidade === 'unica') return [renda.data];

  const passo = renda.periodicidade === 'anual' ? 12 : 1;
  const piso = meiaNoiteDe(renda.data);
  const inicio = new Date(renda.data);
  const dia = inicio.getDate();
  const hora = inicio.getHours();
  const minuto = inicio.getMinutes();

  const saida: number[] = [];
  // Teto de seguranca: 60 anos de recorrencia mensal. Um `encerradoEm` maluco
  // vindo de outro aparelho nao pode virar laço infinito na tela.
  for (let n = 0; n < 720; n += 1) {
    const alvo = new Date(inicio.getFullYear(), inicio.getMonth() + n * passo, 1);
    const ano = alvo.getFullYear();
    const mes = alvo.getMonth();
    const ms = new Date(ano, mes, diaDoMesSeguro(ano, mes, dia), hora, minuto, 0, 0).getTime();
    if (ms > fim) break;
    if (ms >= piso) saida.push(ms);
  }
  return saida;
}

/** Soma das entradas de um periodo, opcionalmente so as de uma conta. */
export function entradasEntre(
  rendas: readonly Renda[],
  inicio: number,
  fim: number,
  contaId?: string,
): number {
  let total = 0;
  for (const renda of rendas) {
    if (!naoExcluido(renda)) continue;
    if (contaId !== undefined && renda.contaId !== contaId) continue;
    for (const ms of ocorrenciasDeRenda(renda, fim)) {
      if (ms >= inicio) total += renda.valor;
    }
  }
  return total;
}

// ------------------------------------------------------------------ contas

/** A compra tira dinheiro de uma conta na hora? Credito nao: vira fatura. */
export function saiDoCaixa(compra: Compra, contas: readonly Conta[]): boolean {
  const conta = acharConta(contas, compra.contaId);
  return conta !== undefined && conta.tipo !== 'credito';
}

export function acharConta(
  contas: readonly Conta[],
  id: string | null | undefined,
): Conta | undefined {
  if (!id) return undefined;
  return contas.find((conta) => conta.id === id && naoExcluido(conta));
}

export interface SaldoConta {
  conta: Conta;
  /** Centavos disponiveis agora. */
  saldo: number;
  entradas: number;
  saidas: number;
}

/**
 * Saldo de uma conta que guarda dinheiro (corrente, vale, espécie).
 *
 * Cartao de credito nao entra aqui: ele nao tem saldo, tem fatura.
 *
 * O CORTE E POR DIA, INCLUSIVE, e isto e a correcao de um bug real: o saldo de
 * partida vale a partir de uma DATA, entao tudo lançado nesse dia ou depois
 * conta. Antes o corte era o instante exato de `saldoInicialEm`, e as tres
 * perguntas abaixo tinham tres respostas diferentes — renda usava `>=`, compra e
 * transferencia usavam `>`. Duas entradas cadastradas as 14h55 sumiam de um
 * saldo informado as 15h, sem aviso nenhum. Diferenca de minutos nao pode
 * decidir se dinheiro existe.
 */
export function saldoDaConta(
  conta: Conta,
  dados: DadosFinanceiros,
  agora: number,
): SaldoConta {
  const desde = meiaNoiteDe(conta.saldoInicialEm);

  const entradasRenda = entradasEntre(dados.rendas, desde, agora, conta.id);
  const recebidas = dados.transferencias
    .filter(
      (t) =>
        naoExcluido(t) && t.alvo === 'conta' && t.alvoId === conta.id && t.data >= desde && t.data <= agora,
    )
    .reduce((soma, t) => soma + t.valor, 0);

  const gastos = dados.compras
    .filter((c) => naoExcluido(c) && c.contaId === conta.id && c.data >= desde && c.data <= agora)
    .reduce((soma, c) => soma + c.total, 0);

  const enviadas = dados.transferencias
    .filter((t) => naoExcluido(t) && t.origemContaId === conta.id && t.data >= desde && t.data <= agora)
    .reduce((soma, t) => soma + t.valor, 0);

  const entradas = entradasRenda + recebidas;
  const saidas = gastos + enviadas;

  return { conta, entradas, saidas, saldo: conta.saldoInicial + entradas - saidas };
}

/** Saldo de todas as contas que guardam dinheiro, na ordem cadastrada. */
export function saldoPorConta(dados: DadosFinanceiros, agora: number): SaldoConta[] {
  return dados.contas
    .filter((conta) => naoExcluido(conta) && conta.tipo !== 'credito')
    .sort((a, b) => a.ordem - b.ordem)
    .map((conta) => saldoDaConta(conta, dados, agora));
}

// ----------------------------------------------------------------- faturas

export type SituacaoFatura = 'aberta' | 'fechada' | 'paga';

export interface Fatura extends Ciclo {
  contaId: string;
  apelido: string;
  fechamentoEm: number;
  situacao: SituacaoFatura;
}

/** Todas as parcelas de compra que caem num cartao. */
export function parcelasDoCartao(conta: Conta, compras: readonly Compra[]): Parcela[] {
  return compras
    .filter((compra) => naoExcluido(compra) && compra.contaId === conta.id)
    .flatMap((compra) => parcelasDaCompra(compra, conta));
}

export function pagamentosDe(
  transferencias: readonly Transferencia[],
  alvo: 'cartao' | 'divida',
  alvoId: string,
): Transferencia[] {
  return transferencias.filter(
    (t) => naoExcluido(t) && t.alvo === alvo && t.alvoId === alvoId,
  );
}

/**
 * As faturas de um cartao, uma por competencia.
 *
 * O total e a soma das PARCELAS que vencem no mes, e nao dos totais das compras
 * feitas nele. E o que faz uma compra em 12x pesar R$ 100 por mes em vez de
 * R$ 1.200 de uma vez.
 */
export function faturasDoCartao(
  conta: Conta,
  dados: DadosFinanceiros,
  agora: number,
): Fatura[] {
  const parcelas = parcelasDoCartao(conta, dados.compras);
  const pagamentos = pagamentosDe(dados.transferencias, 'cartao', conta.id);

  return porCompetencia(parcelas, pagamentos).map((ciclo) => ({
    ...ciclo,
    contaId: conta.id,
    apelido: conta.apelido,
    fechamentoEm: fechamentoDe(conta, ciclo.competencia),
    vencimentoEm: vencimentoDe(conta, ciclo.competencia),
    situacao: situacaoDaFatura(ciclo, fechamentoDe(conta, ciclo.competencia), agora),
  }));
}

function situacaoDaFatura(ciclo: Ciclo, fechamentoEm: number, agora: number): SituacaoFatura {
  if (ciclo.total > 0 && ciclo.restante === 0) return 'paga';
  return agora > fechamentoEm ? 'fechada' : 'aberta';
}

export function todasAsFaturas(dados: DadosFinanceiros, agora: number): Fatura[] {
  return dados.contas
    .filter((conta) => naoExcluido(conta) && conta.tipo === 'credito')
    .sort((a, b) => a.ordem - b.ordem)
    .flatMap((conta) => faturasDoCartao(conta, dados, agora));
}

// ------------------------------------------------------------ compromissos

export interface Compromisso {
  origem: 'cartao' | 'divida';
  id: string;
  descricao: string;
  falta: Falta;
  ciclos: Ciclo[];
  /** Centavos ainda disponiveis no limite do cartao. `null` quando nao ha limite. */
  disponivel: number | null;
}

/** Quanto falta pagar, por cartao e por divida. */
export function compromissos(dados: DadosFinanceiros, agora: number): Compromisso[] {
  const saida: Compromisso[] = [];

  for (const conta of dados.contas) {
    if (!naoExcluido(conta) || conta.tipo !== 'credito') continue;
    const ciclos = porCompetencia(
      parcelasDoCartao(conta, dados.compras),
      pagamentosDe(dados.transferencias, 'cartao', conta.id),
    );
    const falta = quantoFalta(ciclos);
    saida.push({
      origem: 'cartao',
      id: conta.id,
      descricao: conta.apelido,
      falta,
      ciclos,
      disponivel: conta.limite > 0 ? Math.max(0, conta.limite - falta.restante) : null,
    });
  }

  for (const divida of dados.dividas) {
    if (!naoExcluido(divida)) continue;
    const ciclos = porCompetencia(
      parcelasDaDivida(divida),
      pagamentosDe(dados.transferencias, 'divida', divida.id),
    );
    saida.push({
      origem: 'divida',
      id: divida.id,
      descricao: divida.descricao,
      falta: quantoFalta(ciclos),
      ciclos,
      disponivel: null,
    });
  }

  void agora;
  return saida;
}

/** Tudo que ainda falta pagar, somado. */
export function totalComprometido(lista: readonly Compromisso[]): number {
  return lista.reduce((soma, item) => soma + item.falta.restante, 0);
}

/** A competencia em que o ultimo compromisso termina. */
export function terminaEm(lista: readonly Compromisso[]): string | null {
  const finais = lista
    .filter((item) => item.falta.restante > 0)
    .map((item) => item.falta.ultima)
    .filter((chave): chave is string => chave !== null);
  return finais.length > 0 ? finais.sort()[finais.length - 1]! : null;
}

// -------------------------------------------------------------- a carteira

export interface Carteira {
  contas: SaldoConta[];
  /** Soma das contas correntes e de espécie. Vale nao entra: nao paga fatura. */
  saldoEmConta: number;
  /** Saldo de cada vale, que so compra comida. */
  saldoEmVales: number;
  compromissos: Compromisso[];
  /** Centavos que faltam pagar no total. */
  aPagar: number;
  /** Saldo em conta menos o que falta pagar. Pode ser negativo. */
  sobraProjetada: number;
  terminaEm: string | null;
  /** Compras sem conta definida — ficam fora do saldo, e a tela avisa. */
  semConta: { quantidade: number; total: number };
  /** Entradas sem conta definida — mesmo problema, mesmo aviso. */
  rendasSemConta: { quantidade: number; total: number };
}

export function calcularCarteira(dados: DadosFinanceiros, agora: number): Carteira {
  const contas = saldoPorConta(dados, agora);
  const lista = compromissos(dados, agora);

  const saldoEmConta = contas
    .filter((s) => s.conta.tipo === 'corrente' || s.conta.tipo === 'dinheiro')
    .reduce((soma, s) => soma + s.saldo, 0);

  const saldoEmVales = contas
    .filter((s) => s.conta.tipo === 'vale')
    .reduce((soma, s) => soma + s.saldo, 0);

  const aPagar = totalComprometido(lista);
  const semConta = comprasSemConta(dados);
  const rendasSemConta = entradasSemConta(dados, agora);

  return {
    contas,
    saldoEmConta,
    saldoEmVales,
    compromissos: lista,
    aPagar,
    sobraProjetada: saldoEmConta - aPagar,
    terminaEm: terminaEm(lista),
    semConta,
    rendasSemConta,
  };
}

/**
 * Compras que nao apontam para conta nenhuma.
 *
 * Elas ficam de fora do saldo de proposito — chutar uma conta seria pior. A tela
 * mostra quantas sao e quanto somam, com link para corrigir: aviso corrigivel e
 * melhor que um numero errando em silencio.
 */
export function comprasSemConta(dados: DadosFinanceiros): { quantidade: number; total: number } {
  const soltas = dados.compras.filter(
    (compra) => naoExcluido(compra) && !acharConta(dados.contas, compra.contaId),
  );
  return {
    quantidade: soltas.length,
    total: soltas.reduce((soma, compra) => soma + compra.total, 0),
  };
}

/**
 * Entradas que nao apontam para conta nenhuma.
 *
 * O contraponto de `comprasSemConta`, e existe pelo mesmo motivo: elas ficam
 * fora de todo saldo, porque `saldoDaConta` casa renda com conta por id e
 * `null` nao casa com nenhuma. A diferenca e que aqui o silencio era pior — a
 * tela de entradas chamava a opcao vazia de "Conta corrente (o padrão)", ou
 * seja, prometia uma conta que o codigo nunca entregava.
 *
 * Soma so o que ja caiu ate `agora`: uma recorrente cadastrada hoje ainda vai
 * cair muitas vezes, e avisar sobre o futuro dela seria alarme sem tamanho.
 */
export function entradasSemConta(
  dados: DadosFinanceiros,
  agora: number,
): { quantidade: number; total: number } {
  const soltas = dados.rendas.filter(
    (renda) => naoExcluido(renda) && !acharConta(dados.contas, renda.contaId),
  );
  return {
    quantidade: soltas.length,
    total: soltas.reduce(
      (soma, renda) => soma + renda.valor * ocorrenciasDeRenda(renda, agora).length,
      0,
    ),
  };
}

// ------------------------------------------------------------- mes corrente

export interface MesFinanceiro {
  mes: string;
  entradas: number;
  /** Saiu da conta na data: debito, pix, espécie. */
  saidasAVista: number;
  /** Foi comprado no credito e vira fatura depois. Nao saiu do caixa ainda. */
  noCredito: number;
  noVale: number;
  /** Faturas e parcelas efetivamente pagas no mes. */
  pagamentos: number;
  /** O que vence no mes e ainda nao foi pago. */
  aVencer: number;
  /** entradas - saidasAVista - pagamentos - aVencer. */
  sobra: number;
  /** Quanto do gasto do mes virou parcela de meses seguintes. */
  adiadoEmParcelas: number;
}

/**
 * O fechamento de caixa de um mes.
 *
 * Repare que `noCredito` fica FORA da sobra: no mes da compra ele nao saiu de
 * lugar nenhum. Quem sai e o pagamento da fatura, que aparece em `pagamentos`.
 * Somar os dois seria exatamente a contagem dupla que este arquivo existe para
 * impedir.
 */
export function resumoDoMes(dados: DadosFinanceiros, mes: string, agora: number): MesFinanceiro {
  const { inicio, fim } = intervaloDoMes(mes);

  const doMes = dados.compras.filter(
    (c) => naoExcluido(c) && c.data >= inicio && c.data <= fim,
  );

  let saidasAVista = 0;
  let noCredito = 0;
  let noVale = 0;
  let adiado = 0;

  for (const compra of doMes) {
    const conta = acharConta(dados.contas, compra.contaId);
    if (!conta) continue;
    if (conta.tipo === 'credito') {
      noCredito += compra.total;
      const parcelas = parcelasDaCompra(compra, conta);
      adiado += parcelas.filter((p) => p.indice > 1).reduce((soma, p) => soma + p.valor, 0);
    } else if (conta.tipo === 'vale') {
      noVale += compra.total;
    } else {
      saidasAVista += compra.total;
    }
  }

  const pagamentos = dados.transferencias
    .filter((t) => naoExcluido(t) && t.alvo !== 'conta' && t.data >= inicio && t.data <= fim)
    .reduce((soma, t) => soma + t.valor, 0);

  const aVencer = todasAsFaturas(dados, agora)
    .filter((f) => f.competencia === mes)
    .reduce((soma, f) => soma + f.restante, 0)
    + compromissos(dados, agora)
      .filter((c) => c.origem === 'divida')
      .flatMap((c) => c.ciclos)
      .filter((ciclo) => ciclo.competencia === mes)
      .reduce((soma, ciclo) => soma + ciclo.restante, 0);

  const entradas = entradasEntre(dados.rendas, inicio, fim);

  return {
    mes,
    entradas,
    saidasAVista,
    noCredito,
    noVale,
    pagamentos,
    aVencer,
    sobra: entradas - saidasAVista - pagamentos - aVencer,
    adiadoEmParcelas: adiado,
  };
}

// ------------------------------------------------------- gasto por natureza

export type GastoPorGrupo = Record<GrupoCategoria, number>;

export function gastoPorGrupo(compras: readonly Compra[], inicio: number, fim: number): GastoPorGrupo {
  const saida: GastoPorGrupo = { fixo: 0, variavel: 0, eventual: 0 };
  for (const compra of compras) {
    if (!naoExcluido(compra) || compra.data < inicio || compra.data > fim) continue;
    saida[grupoDaCategoria(compra.categoria)] += compra.total;
  }
  return saida;
}

/** Meses completos anteriores ao de `agora`, do mais recente para tras. */
export function mesesCompletosAntes(agora: number, quantos: number): string[] {
  const atual = chaveDoMes(agora);
  const saida: string[] = [];
  for (let n = 1; n <= quantos; n += 1) saida.push(somarMeses(atual, -n));
  return saida;
}

/** Aceita "2026-09" e devolve o primeiro instante do mes. Util nas telas. */
export function inicioDaCompetencia(competencia: string): number {
  const { ano, mes } = partesDaChave(competencia);
  return new Date(ano, mes, 1).getTime();
}
