/**
 * Parcelas — de compra no cartao e de divida, pela mesma matematica.
 *
 * A decisao que simplifica tudo: **a fatura de um mes e a soma das parcelas que
 * vencem nele**, e uma compra a vista no credito e o caso de UMA parcela. Com
 * isso, "compra parcelada" deixa de ser um caso especial e nenhuma ramificacao
 * extra aparece no resto do codigo. Emprestimo e financiamento entram na mesma
 * funcao: valor total, quantas vezes, data da primeira.
 *
 * O CENTAVO IMPORTA. R$ 100,00 em 3x precisa dar 33,34 + 33,33 + 33,33 = 100,00
 * exatos, e nunca 3 x 33,33 = 99,99. A primeira parcela absorve a diferença,
 * como a maioria das operadoras faz. E a mesma exigencia da decisao do total do
 * item ser soberano: o numero que o app mostra tem que bater com o que a fatura
 * cobra, senao a conferencia no fim do mes nao fecha e nao ha pista de onde veio
 * o erro.
 */

import {
  chaveDoMes,
  competenciaDe,
  diaDoMesSeguro,
  partesDaChave,
  somarMeses,
  vencimentoDe,
} from './fatura';
import type { Compra, Conta, Divida, Transferencia } from './tipos';

export interface Parcela {
  origem: 'cartao' | 'divida';
  /** A conta de credito ou a divida — e por ela que a parcela e cobrada. */
  origemId: string;
  /** A compra ou a divida que gerou a parcela, para abrir o detalhe. */
  fonteId: string;
  descricao: string;
  /** 1-based: a primeira parcela e a de indice 1. */
  indice: number;
  de: number;
  competencia: string;
  vencimentoEm: number;
  /** Centavos. */
  valor: number;
}

/**
 * Quanto vale a parcela `indice` de `parcelas`, em centavos inteiros.
 *
 * A soma de todas e exatamente `total` — e isso e garantido por teste, varrendo
 * uma faixa de valores e de numeros de parcela.
 */
export function valorDaParcela(total: number, parcelas: number, indice: number): number {
  const vezes = Math.max(1, Math.floor(parcelas));
  const base = Math.floor(total / vezes);
  if (indice > 1) return base;
  return total - base * (vezes - 1);
}

/** Quantas vezes uma compra foi dividida, tolerando registro antigo sem o campo. */
export function vezesDa(compra: Pick<Compra, 'parcelas'>): number {
  const vezes = Math.floor(compra.parcelas ?? 1);
  return vezes >= 1 ? vezes : 1;
}

/**
 * As parcelas de uma compra no credito.
 *
 * A primeira cai na competencia do ciclo em que a compra entrou; as seguintes,
 * mes a mes a partir dela. Compra que nao e no credito nao gera parcela nenhuma:
 * ela ja saiu do caixa na data.
 */
export function parcelasDaCompra(compra: Compra, conta: Conta | undefined): Parcela[] {
  if (!conta || conta.tipo !== 'credito') return [];

  const vezes = vezesDa(compra);
  const primeira = competenciaDaCompra(compra, conta);
  const saida: Parcela[] = [];

  for (let indice = 1; indice <= vezes; indice += 1) {
    const competencia = somarMeses(primeira, indice - 1);
    saida.push({
      origem: 'cartao',
      origemId: conta.id,
      fonteId: compra.id,
      descricao: compra.descricao || compra.categoria || 'Compra',
      indice,
      de: vezes,
      competencia,
      vencimentoEm: vencimentoDe(conta, competencia),
      valor: valorDaParcela(compra.total, vezes, indice),
    });
  }

  return saida;
}

/** A competencia da primeira parcela — util na tela, antes de gerar a lista. */
export function competenciaDaCompra(compra: Compra, conta: Conta): string {
  return competenciaDe(conta, compra.data);
}

/**
 * As parcelas de um emprestimo ou financiamento.
 *
 * Vencem no mesmo dia do mes da primeira. Dia 31 em fevereiro cai no ultimo dia,
 * pela mesma razao do ciclo do cartao.
 */
export function parcelasDaDivida(divida: Divida): Parcela[] {
  const vezes = Math.max(1, Math.floor(divida.parcelas));
  const primeira = chaveDoMes(divida.primeiraEm);
  const dia = new Date(divida.primeiraEm).getDate();
  const saida: Parcela[] = [];

  for (let indice = 1; indice <= vezes; indice += 1) {
    const competencia = somarMeses(primeira, indice - 1);
    const { ano, mes } = partesDaChave(competencia);
    saida.push({
      origem: 'divida',
      origemId: divida.id,
      fonteId: divida.id,
      descricao: divida.descricao || 'Dívida',
      indice,
      de: vezes,
      competencia,
      vencimentoEm: new Date(ano, mes, diaDoMesSeguro(ano, mes, dia), 0, 0, 0, 0).getTime(),
      valor: valorDaParcela(divida.valorTotal, vezes, indice),
    });
  }

  return saida;
}

/** Soma dos valores de uma lista de parcelas. */
export function somar(parcelas: readonly Parcela[]): number {
  return parcelas.reduce((total, parcela) => total + parcela.valor, 0);
}

/** Parcelas que caem numa competencia. */
export function daCompetencia(parcelas: readonly Parcela[], competencia: string): Parcela[] {
  return parcelas.filter((parcela) => parcela.competencia === competencia);
}

/** Uma competencia fechada em si mesma: o que vence no mes e o que foi pago nele. */
export interface Ciclo {
  competencia: string;
  vencimentoEm: number;
  /** Centavos que vencem nesta competencia. */
  total: number;
  /** Centavos ja pagos DESTA competencia. */
  pago: number;
  /** Centavos que faltam. Nunca negativo: pagar a mais nao vira credito. */
  restante: number;
  /**
   * Liquidado por PRESUNCAO, e nao por pagamento registrado.
   *
   * Existe para a tela poder dizer "considerada paga no vencimento" em vez de
   * fingir que houve pagamento. Presuncao marcada e corrigivel; presuncao
   * disfarçada de pagamento vira numero errado sem pista de origem.
   */
  presumido: boolean;
  parcelas: Parcela[];
}

/**
 * Agrupa parcelas e pagamentos por competencia.
 *
 * A conta e feita competencia a competencia, e nao no agregado, porque um
 * pagamento parcial de setembro nao pode aparecer como adiantamento de outubro:
 * a fatura de setembro tem que continuar mostrando o que falta dela.
 *
 * `presumidoAte` e a competencia ate a qual tudo conta como pago sem registro
 * nenhum. Existe porque quem cadastra hoje um financiamento que ja corre ha um
 * ano nao vai registrar doze pagamentos para o app parar de dizer "faltam 24 de
 * 24" — e porque esse dinheiro ja saiu da conta antes do saldo de partida, entao
 * cobra-lo de novo seria contagem dupla.
 */
export function porCompetencia(
  parcelas: readonly Parcela[],
  pagamentos: readonly Transferencia[],
  presumidoAte: string | null = null,
): Ciclo[] {
  const mapa = new Map<string, Ciclo>();

  for (const parcela of parcelas) {
    const ciclo = mapa.get(parcela.competencia) ?? {
      competencia: parcela.competencia,
      vencimentoEm: parcela.vencimentoEm,
      total: 0,
      pago: 0,
      restante: 0,
      presumido: false,
      parcelas: [],
    };
    ciclo.total += parcela.valor;
    ciclo.parcelas.push(parcela);
    mapa.set(parcela.competencia, ciclo);
  }

  for (const pagamento of pagamentos) {
    const ciclo = mapa.get(pagamento.competencia);
    // Pagamento de uma competencia sem parcela nenhuma (fatura antiga, ajuste)
    // ainda conta: ele saiu do caixa de verdade.
    if (!ciclo) {
      mapa.set(pagamento.competencia, {
        competencia: pagamento.competencia,
        vencimentoEm: pagamento.data,
        total: 0,
        pago: pagamento.valor,
        restante: 0,
        presumido: false,
        parcelas: [],
      });
      continue;
    }
    ciclo.pago += pagamento.valor;
  }

  const ciclos = [...mapa.values()];
  for (const ciclo of ciclos) {
    const falta = Math.max(0, ciclo.total - ciclo.pago);
    // Duas condicoes, e a segunda foi um teste que a apontou:
    //
    // - so e presuncao quando sobrou algo para presumir; competencia quitada de
    //   verdade continua sendo pagamento, e a tela nao deve chama-la presumida;
    // - competencia com QUALQUER pagamento registrado nunca e presumida. Pagar
    //   R$ 40 de uma fatura de R$ 100 e dizer ao app que voce esta acompanhando
    //   aquele ciclo — presumir os R$ 60 restantes esconderia rotativo real. A
    //   presuncao existe para o que voce nunca contou ao app, nao para
    //   sobrescrever o que contou.
    ciclo.presumido =
      presumidoAte !== null &&
      falta > 0 &&
      ciclo.pago === 0 &&
      ciclo.competencia <= presumidoAte;
    ciclo.restante = ciclo.presumido ? 0 : falta;
  }
  return ciclos.sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export interface Falta {
  previsto: number;
  pago: number;
  /** Soma do que falta em cada competencia. */
  restante: number;
  /** Quantas competencias ainda tem saldo devedor. */
  parcelasRestantes: number;
  /** Competencia da ultima parcela, para dizer "ate mar/2028". */
  ultima: string | null;
  /** Competencia da proxima que ainda deve algo. */
  proxima: string | null;
}

/** Quanto falta pagar, somando o que sobrou de cada competencia. */
export function quantoFalta(ciclos: readonly Ciclo[]): Falta {
  const devendo = ciclos.filter((ciclo) => ciclo.restante > 0);
  const comParcelas = ciclos.filter((ciclo) => ciclo.parcelas.length > 0);

  return {
    previsto: ciclos.reduce((soma, ciclo) => soma + ciclo.total, 0),
    pago: ciclos.reduce((soma, ciclo) => soma + ciclo.pago, 0),
    restante: devendo.reduce((soma, ciclo) => soma + ciclo.restante, 0),
    parcelasRestantes: devendo.length,
    ultima: comParcelas.length > 0 ? comParcelas[comParcelas.length - 1]!.competencia : null,
    proxima: devendo.length > 0 ? devendo[0]!.competencia : null,
  };
}
