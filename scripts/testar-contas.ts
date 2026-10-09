/**
 * Teste das contas: centavos de parcela, ciclo de fatura, contagem dupla,
 * previsao, metas, categorizacao e sugestoes.
 *
 * Existe pelo mesmo motivo que o teste de sincronizacao: **estes erros sao
 * silenciosos**. Contar o pagamento da fatura como gasto novo nao quebra tela,
 * nao levanta excecao e nao aparece no build — o sintoma e um saldo errado
 * descoberto no fim do mes, quando ja e tarde para descobrir de onde veio.
 * Perder um centavo por parcelamento e a mesma coisa, so que menor e pior de
 * achar. E uma previsao errada faz alguem comprar o que nao cabia.
 *
 * Como todas as funcoes envolvidas sao puras, o teste custa milissegundos.
 *
 * Roda com: npm run teste:contas
 */

import { grupoDaCategoria, CATEGORIAS, GRUPO_DA_CATEGORIA } from '../compartilhado/constantes';
import {
  acharConta,
  calcularCarteira,
  compromissos,
  dataDoDescontoEmFolha,
  diaDoSalario,
  extratoDeDividas,
  faturasDoCartao,
  materializarRenda,
  ocorrenciasDeRenda,
  parcelasQuitadasDaCompetencia,
  resumoDoMes,
  saldoDaConta,
  type DadosFinanceiros,
} from '../compartilhado/carteira';
import {
  competenciaDe,
  diaDoMesSeguro,
  diasAtePagar,
  somarMeses,
  vencimentoDe,
} from '../compartilhado/fatura';
import {
  parcelasDaCompra,
  parcelasDaDivida,
  porCompetencia,
  quantoFalta,
  valorDaParcela,
} from '../compartilhado/parcelamento';
import {
  estimarEntradaMensal,
  estimarGastoCorrente,
  panorama,
  planejarMeta,
  projetar,
  simular,
  temBaseDeEntrada,
} from '../compartilhado/previsao';
import { limitesDo } from '../compartilhado/planos';
import { MODELO_DE_IA_PADRAO, MODELOS_DE_IA, modeloValido } from '../compartilhado/modelos';
import {
  adivinharCategoria,
  deveAplicarSozinho,
  resumirHistorico,
  type UsoDaDescricao,
} from '../compartilhado/categorizacao';
import { casaTermo, fatorDeRecencia, ordenarSugestoes } from '../compartilhado/sugestoes';
import { motivoParaNaoTransferir } from '../compartilhado/tipos';
import {
  deInputData,
  formatarData,
  formatarDataCurta,
  formatarDataHora,
  mesesDaLista,
  nomeMes,
  paraInputData,
} from '../src/lib/datas';
import type {
  Compra,
  Conta,
  Divida,
  Meta,
  RegraCategoria,
  Renda,
  Transferencia,
} from '../compartilhado/tipos';

let falhas = 0;

function conferir(descricao: string, condicao: boolean, detalhe = ''): void {
  if (condicao) {
    console.log('  ok   ' + descricao);
  } else {
    falhas += 1;
    console.log('  FALHA ' + descricao + (detalhe ? '  -> ' + detalhe : ''));
  }
}

function igual(descricao: string, obtido: unknown, esperado: unknown): void {
  conferir(descricao, Object.is(obtido, esperado), `obtido ${String(obtido)}, esperado ${String(esperado)}`);
}

// --------------------------------------------------------------- fabricas

const T = (ano: number, mes: number, dia: number, hora = 12) =>
  new Date(ano, mes - 1, dia, hora, 0, 0, 0).getTime();

let sequencia = 0;
const id = (prefixo: string) => `${prefixo}-${(sequencia += 1)}`;

function conta(parcial: Partial<Conta> = {}): Conta {
  return {
    id: parcial.id ?? id('conta'),
    apelido: parcial.apelido ?? 'Conta',
    tipo: parcial.tipo ?? 'corrente',
    diaFechamento: parcial.diaFechamento ?? 20,
    diaVencimento: parcial.diaVencimento ?? 27,
    limite: parcial.limite ?? 0,
    saldoInicial: parcial.saldoInicial ?? 0,
    saldoInicialEm: parcial.saldoInicialEm ?? T(2026, 1, 1),
    ordem: parcial.ordem ?? 0,
    atualizadoEm: 0,
    excluidoEm: null,
  };
}

function compra(parcial: Partial<Compra> = {}): Compra {
  const total = parcial.total ?? 10000;
  return {
    id: parcial.id ?? id('compra'),
    data: parcial.data ?? T(2026, 8, 10),
    descricao: parcial.descricao ?? '',
    categoria: parcial.categoria ?? 'Mercado',
    formaPagamento: parcial.formaPagamento ?? '',
    observacao: '',
    totalManual: total,
    total,
    qtdItens: 0,
    contaId: parcial.contaId ?? null,
    parcelas: parcial.parcelas ?? 1,
    atualizadoEm: 0,
    excluidoEm: parcial.excluidoEm ?? null,
  };
}

function renda(parcial: Partial<Renda> = {}): Renda {
  return {
    id: parcial.id ?? id('renda'),
    data: parcial.data ?? T(2026, 1, 5),
    descricao: '',
    origem: 'Salário',
    valor: parcial.valor ?? 300000,
    // Entrada e lancamento: o padrao e `unica`. Regra recorrente so existe nos
    // testes da migracao, onde ela e pedida por extenso.
    periodicidade: parcial.periodicidade ?? 'unica',
    encerradoEm: parcial.encerradoEm ?? null,
    contaId: parcial.contaId ?? null,
    atualizadoEm: 0,
    excluidoEm: null,
  };
}

/**
 * O que a pessoa faz agora: uma entrada por mes, na data em que ela cai.
 * `de` e `ate` sao competencias ("2026-06"), as duas incluidas.
 */
function salarios(
  de: string,
  ate: string,
  dia: number,
  valor: number,
  resto: Partial<Renda> = {},
): Renda[] {
  const lista: Renda[] = [];
  for (let mes = de; mes <= ate; mes = somarMeses(mes, 1)) {
    const [ano, m] = mes.split('-').map(Number) as [number, number];
    lista.push(renda({ ...resto, data: T(ano, m, dia, 8), valor }));
  }
  return lista;
}

function divida(parcial: Partial<Divida> = {}): Divida {
  return {
    id: parcial.id ?? id('divida'),
    descricao: parcial.descricao ?? 'Empréstimo',
    tipo: parcial.tipo ?? 'emprestimo',
    valorTotal: parcial.valorTotal ?? 1200000,
    parcelas: parcial.parcelas ?? 24,
    primeiraEm: parcial.primeiraEm ?? T(2026, 1, 10),
    descontoEmFolha: parcial.descontoEmFolha ?? false,
    parcelaVariavel: parcial.parcelaVariavel ?? false,
    contaId: parcial.contaId ?? null,
    observacao: '',
    atualizadoEm: 0,
    excluidoEm: null,
  };
}

function transferencia(parcial: Partial<Transferencia> = {}): Transferencia {
  return {
    id: parcial.id ?? id('transf'),
    origemContaId: parcial.origemContaId ?? '',
    alvo: parcial.alvo ?? 'cartao',
    alvoId: parcial.alvoId ?? '',
    competencia: parcial.competencia ?? '',
    data: parcial.data ?? T(2026, 9, 27),
    valor: parcial.valor ?? 0,
    observacao: '',
    atualizadoEm: 0,
    excluidoEm: null,
  };
}

function dados(parcial: Partial<DadosFinanceiros> = {}): DadosFinanceiros {
  return {
    contas: parcial.contas ?? [],
    compras: parcial.compras ?? [],
    rendas: parcial.rendas ?? [],
    dividas: parcial.dividas ?? [],
    metas: parcial.metas ?? [],
    transferencias: parcial.transferencias ?? [],
  };
}

// ================================================================ 1. centavos

console.log('\n1. A soma das parcelas e exatamente o total');
{
  const tres = [1, 2, 3].map((i) => valorDaParcela(10000, 3, i));
  igual('R$ 100,00 em 3x: primeira parcela', tres[0], 3334);
  igual('R$ 100,00 em 3x: segunda parcela', tres[1], 3333);
  igual('R$ 100,00 em 3x: soma', tres[0]! + tres[1]! + tres[2]!, 10000);

  let todasFecham = true;
  let exemplo = '';
  for (let total = 1; total <= 5000; total += 7) {
    for (const vezes of [1, 2, 3, 4, 5, 6, 7, 10, 12, 18, 24, 36, 48]) {
      let soma = 0;
      for (let i = 1; i <= vezes; i += 1) soma += valorDaParcela(total, vezes, i);
      if (soma !== total) {
        todasFecham = false;
        exemplo = `${total} em ${vezes}x deu ${soma}`;
        break;
      }
    }
    if (!todasFecham) break;
  }
  conferir('a soma fecha para toda a faixa de valores e parcelas', todasFecham, exemplo);
}

// ================================================================== 2. ciclo

console.log('\n2. O ciclo da fatura');
{
  const cartao = conta({ tipo: 'credito', diaFechamento: 20, diaVencimento: 27 });

  igual('compra no dia 20 fecha no ciclo do proprio mes', competenciaDe(cartao, T(2026, 9, 20)), '2026-09');
  igual('compra no dia 21 cai no ciclo seguinte', competenciaDe(cartao, T(2026, 9, 21)), '2026-10');
  igual('compra no dia 19 fica no ciclo do mes', competenciaDe(cartao, T(2026, 9, 19)), '2026-09');

  const viraAno = conta({ tipo: 'credito', diaFechamento: 20, diaVencimento: 27 });
  igual('compra em 25/12 cai na fatura de janeiro', competenciaDe(viraAno, T(2026, 12, 25)), '2027-01');

  // Vencimento ANTES do fechamento: a fatura so pode vencer no mes seguinte.
  const cedo = conta({ tipo: 'credito', diaFechamento: 28, diaVencimento: 5 });
  igual('venc. menor que fech.: compra em 27/09 vence em outubro', competenciaDe(cedo, T(2026, 9, 27)), '2026-10');
  igual('venc. menor que fech.: compra em 29/09 vence em novembro', competenciaDe(cedo, T(2026, 9, 29)), '2026-11');

  igual('dia 31 em fevereiro vira 28', diaDoMesSeguro(2026, 1, 31), 28);
  igual('dia 31 em fevereiro bissexto vira 29', diaDoMesSeguro(2028, 1, 31), 29);
  igual('dia 31 em marco continua 31', diaDoMesSeguro(2026, 2, 31), 31);

  const fim = conta({ tipo: 'credito', diaFechamento: 31, diaVencimento: 10 });
  igual('fechamento 31 em fevereiro nao escorrega de mes', competenciaDe(fim, T(2026, 2, 28)), '2026-03');

  const venc = vencimentoDe(cartao, '2026-09');
  igual('o vencimento e o dia 27', new Date(venc).getDate(), 27);

  const cedoDias = diasAtePagar(cartao, T(2026, 9, 18));
  const tardeDias = diasAtePagar(cartao, T(2026, 9, 21));
  conferir(
    'comprar depois do fechamento da muito mais prazo',
    tardeDias > cedoDias + 25,
    `dia 18: ${cedoDias} dias, dia 21: ${tardeDias} dias`,
  );
}

// ============================================================== 3. parcelas

console.log('\n3. Parcela n cai na competencia certa');
{
  const cartao = conta({ tipo: 'credito', diaFechamento: 20, diaVencimento: 27 });
  const geladeira = compra({ data: T(2026, 9, 10), total: 120000, parcelas: 12, contaId: cartao.id });
  const parcelas = parcelasDaCompra(geladeira, cartao);

  igual('doze parcelas geradas', parcelas.length, 12);
  igual('a primeira vence na competencia da compra', parcelas[0]!.competencia, '2026-09');
  igual('a decima segunda vence um ano depois', parcelas[11]!.competencia, '2027-08');
  igual('cada parcela vale R$ 100,00', parcelas[5]!.valor, 10000);
  igual('a soma das parcelas e o total', parcelas.reduce((s, p) => s + p.valor, 0), 120000);

  const aVista = compra({ data: T(2026, 9, 10), total: 5000, contaId: cartao.id });
  igual('compra a vista no credito gera uma parcela so', parcelasDaCompra(aVista, cartao).length, 1);

  const noDebito = compra({ data: T(2026, 9, 10), total: 5000, contaId: conta().id });
  igual('compra fora do credito nao gera parcela', parcelasDaCompra(noDebito, conta()).length, 0);

  const financiamento: Divida = {
    id: 'div-1',
    descricao: 'Moto',
    tipo: 'financiamento',
    valorTotal: 1200000,
    parcelas: 36,
    primeiraEm: T(2026, 7, 10),
    descontoEmFolha: false,
    parcelaVariavel: false,
    contaId: null,
    observacao: '',
    atualizadoEm: 0,
    excluidoEm: null,
  };
  const dp = parcelasDaDivida(financiamento);
  igual('36 parcelas de divida', dp.length, 36);
  igual('a primeira e em julho/2026', dp[0]!.competencia, '2026-07');
  igual('a ultima e em junho/2029', dp[35]!.competencia, '2029-06');
  igual('a soma das parcelas da divida e o total', dp.reduce((s, p) => s + p.valor, 0), 1200000);
}

// ==================================================== 4. contagem dupla

console.log('\n4. A contagem dupla — o motivo de tudo isto existir');
{
  const corrente = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 200000, saldoInicialEm: T(2026, 9, 1) });
  const cartao = conta({ id: 'cartao', tipo: 'credito', diaFechamento: 20, diaVencimento: 27 });
  const noCredito = compra({ data: T(2026, 9, 10), total: 30000, contaId: cartao.id });

  const antesDoPagamento = dados({ contas: [corrente, cartao], compras: [noCredito] });
  const saldo1 = saldoDaConta(corrente, antesDoPagamento, T(2026, 9, 15));
  igual('compra no credito NAO mexe no saldo da conta', saldo1.saldo, 200000);

  const fatura = faturasDoCartao(cartao, antesDoPagamento, T(2026, 9, 15))[0]!;
  igual('mas entra na fatura do ciclo', fatura.total, 30000);
  igual('a fatura e a de setembro', fatura.competencia, '2026-09');

  const pagamento = transferencia({
    origemContaId: 'cc',
    alvo: 'cartao',
    alvoId: 'cartao',
    competencia: '2026-09',
    data: T(2026, 9, 27),
    valor: 30000,
  });
  const depois = dados({ contas: [corrente, cartao], compras: [noCredito], transferencias: [pagamento] });

  const saldo2 = saldoDaConta(corrente, depois, T(2026, 9, 30));
  igual('o pagamento da fatura tira do saldo UMA vez', saldo2.saldo, 170000);

  const faturaPaga = faturasDoCartao(cartao, depois, T(2026, 9, 30))[0]!;
  igual('a fatura fica sem restante', faturaPaga.restante, 0);
  igual('e marcada como paga', faturaPaga.situacao, 'paga');

  const mes = resumoDoMes(depois, '2026-09', T(2026, 9, 30));
  igual('o gasto do mes conta a compra no credito', mes.noCredito, 30000);
  igual('e NAO conta o pagamento como saida a vista', mes.saidasAVista, 0);
  igual('o pagamento aparece separado', mes.pagamentos, 30000);
  conferir(
    'compra + pagamento nao somam 60000 em lugar nenhum',
    mes.saidasAVista + mes.pagamentos === 30000,
    `saidas ${mes.saidasAVista} + pagamentos ${mes.pagamentos}`,
  );
}

// ===================================================== 5. contas separadas

console.log('\n5. Cada Pix sai da sua conta');
{
  const nubank = conta({ id: 'nu', apelido: 'Nubank', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 9, 1) });
  const caixa = conta({ id: 'cx', apelido: 'Caixa', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 9, 1) });

  const base = dados({
    contas: [nubank, caixa],
    compras: [
      compra({ data: T(2026, 9, 5), total: 20000, contaId: 'nu', formaPagamento: 'Pix' }),
      compra({ data: T(2026, 9, 6), total: 5000, contaId: 'cx', formaPagamento: 'Pix' }),
    ],
  });

  igual('o Pix do Nubank saiu do Nubank', saldoDaConta(nubank, base, T(2026, 9, 30)).saldo, 80000);
  igual('e o do Caixa saiu do Caixa', saldoDaConta(caixa, base, T(2026, 9, 30)).saldo, 95000);

  const saque = transferencia({
    origemContaId: 'nu',
    alvo: 'conta',
    alvoId: 'esp',
    data: T(2026, 9, 10),
    valor: 20000,
  });
  const especie = conta({ id: 'esp', tipo: 'dinheiro', saldoInicial: 0, saldoInicialEm: T(2026, 9, 1) });
  const comSaque = dados({ ...base, contas: [nubank, caixa, especie], transferencias: [saque] });

  const somaAntes =
    saldoDaConta(nubank, base, T(2026, 9, 30)).saldo + saldoDaConta(caixa, base, T(2026, 9, 30)).saldo;
  const carteiraDepois = calcularCarteira(comSaque, T(2026, 9, 30));
  igual('o saque tirou do Nubank', saldoDaConta(nubank, comSaque, T(2026, 9, 30)).saldo, 60000);
  igual('e entrou na espécie', saldoDaConta(especie, comSaque, T(2026, 9, 30)).saldo, 20000);
  igual('a soma das contas nao mudou com o saque', carteiraDepois.saldoEmConta, somaAntes);
}

// ============================================= 5b. transferencia entre contas

console.log('\n5b. Transferencia muda de bolso, e nunca e gasto');
{
  const nu = conta({ id: 'nu', apelido: 'Nubank', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 9, 1) });
  const cx = conta({ id: 'cx', apelido: 'Caixa', tipo: 'corrente', saldoInicial: 50000, saldoInicialEm: T(2026, 9, 1) });
  const vale = conta({ id: 'va', apelido: 'Vale', tipo: 'vale', saldoInicial: 0, saldoInicialEm: T(2026, 9, 1) });
  const cartao = conta({ id: 'cc', apelido: 'Cartao', tipo: 'credito' });

  const semNada = dados({ contas: [nu, cx, vale] });
  const entreCorrentes = dados({
    contas: [nu, cx, vale],
    transferencias: [
      transferencia({ origemContaId: 'nu', alvo: 'conta', alvoId: 'cx', data: T(2026, 9, 10), valor: 20000 }),
    ],
  });

  const antes = calcularCarteira(semNada, T(2026, 9, 30));
  const depois = calcularCarteira(entreCorrentes, T(2026, 9, 30));
  igual('a origem cai', saldoDaConta(nu, entreCorrentes, T(2026, 9, 30)).saldo, 80000);
  igual('o destino sobe', saldoDaConta(cx, entreCorrentes, T(2026, 9, 30)).saldo, 70000);
  igual('e o saldo em conta NAO muda', depois.saldoEmConta, antes.saldoEmConta);

  // Corrente -> vale: sai do dinheiro livre e entra no que so compra comida.
  const paraVale = dados({
    contas: [nu, cx, vale],
    transferencias: [
      transferencia({ origemContaId: 'nu', alvo: 'conta', alvoId: 'va', data: T(2026, 9, 10), valor: 30000 }),
    ],
  });
  const comVale = calcularCarteira(paraVale, T(2026, 9, 30));
  igual('mandar para o vale tira do saldo em conta', comVale.saldoEmConta, antes.saldoEmConta - 30000);
  igual('e poe no vale a mesma quantia', comVale.saldoEmVales, 30000);

  // O mes nao enxerga transferencia entre contas: nao e gasto nem entrada.
  const mesSem = resumoDoMes(semNada, '2026-09', T(2026, 9, 30));
  const mesCom = resumoDoMes(entreCorrentes, '2026-09', T(2026, 9, 30));
  igual('entradas do mes nao mudam', mesCom.entradas, mesSem.entradas);
  igual('saidas a vista nao mudam', mesCom.saidasAVista, mesSem.saidasAVista);
  igual('pagamentos do mes nao mudam', mesCom.pagamentos, mesSem.pagamentos);
  igual('e nada foi para o vale', mesCom.enviadoAoVale, 0);

  // Mandar para o vale e outra coisa: o dinheiro sai do que paga conta. O mes
  // precisa enxergar, senao a sobra fica maior que o saldo — ver a secao 17b.
  const mesVale = resumoDoMes(paraVale, '2026-09', T(2026, 9, 30));
  igual('corrente para vale aparece no mes', mesVale.enviadoAoVale, 30000);
  igual('e sai da sobra', mesVale.sobra, mesSem.sobra - 30000);

  // A regra, caso a caso.
  igual('corrente para corrente pode', motivoParaNaoTransferir(nu, cx, 100), null);
  igual('o vale RECEBE', motivoParaNaoTransferir(nu, vale, 100), null);
  conferir('o vale nao ENVIA', motivoParaNaoTransferir(vale, nu, 100) !== null);
  conferir('credito nao envia', motivoParaNaoTransferir(cartao, nu, 100) !== null);
  conferir('credito nao recebe', motivoParaNaoTransferir(nu, cartao, 100) !== null);
  conferir('mesma conta nos dois lados recusa', motivoParaNaoTransferir(nu, nu, 100) !== null);
  conferir('valor zero recusa', motivoParaNaoTransferir(nu, cx, 0) !== null);
  conferir('sem destino escolhido recusa', motivoParaNaoTransferir(nu, undefined, 100) !== null);
}

// ====================================================== 6. quanto falta

console.log('\n6. Quanto falta cai com cada pagamento');
{
  const cartao = conta({ id: 'c', tipo: 'credito', diaFechamento: 20, diaVencimento: 27, limite: 500000 });
  const geladeira = compra({ data: T(2026, 9, 10), total: 120000, parcelas: 12, contaId: 'c' });

  const semPagar = dados({ contas: [cartao], compras: [geladeira] });
  const antes = compromissos(semPagar, T(2026, 9, 15))[0]!;
  igual('falta o total inteiro', antes.falta.restante, 120000);
  igual('em doze competencias', antes.falta.parcelasRestantes, 12);
  igual('a ultima e em ago/2027', antes.falta.ultima, '2027-08');
  igual('o limite disponivel desconta o que falta', antes.disponivel, 380000);

  const paga1 = dados({
    ...semPagar,
    transferencias: [
      transferencia({ origemContaId: 'cc', alvo: 'cartao', alvoId: 'c', competencia: '2026-09', valor: 10000 }),
    ],
  });
  igual('pagar a primeira derruba para 110000', compromissos(paga1, T(2026, 10, 1))[0]!.falta.restante, 110000);

  const parcial = dados({
    ...semPagar,
    transferencias: [
      transferencia({ origemContaId: 'cc', alvo: 'cartao', alvoId: 'c', competencia: '2026-09', valor: 4000 }),
    ],
  });
  igual('pagamento parcial deixa o resto certo', compromissos(parcial, T(2026, 10, 1))[0]!.falta.restante, 116000);

  const tudo = dados({
    ...semPagar,
    transferencias: parcelasDaCompra(geladeira, cartao).map((p) =>
      transferencia({ origemContaId: 'cc', alvo: 'cartao', alvoId: 'c', competencia: p.competencia, valor: p.valor }),
    ),
  });
  igual('pagando todas, o falta chega a zero', compromissos(tudo, T(2027, 9, 1))[0]!.falta.restante, 0);

  // Pagar setembro nao pode abater outubro: cada competencia se resolve sozinha.
  const soSetembro = porCompetencia(
    parcelasDaCompra(geladeira, cartao),
    [transferencia({ alvo: 'cartao', alvoId: 'c', competencia: '2026-09', valor: 10000 })],
  );
  const outubro = soSetembro.find((c) => c.competencia === '2026-10')!;
  igual('outubro continua devendo o dele', outubro.restante, 10000);
  igual('e setembro fica zerado', soSetembro.find((c) => c.competencia === '2026-09')!.restante, 0);

  const excesso = quantoFalta(
    porCompetencia(parcelasDaCompra(geladeira, cartao), [
      transferencia({ alvo: 'cartao', alvoId: 'c', competencia: '2026-09', valor: 99999 }),
    ]),
  );
  conferir('pagar a mais nao vira credito negativo', excesso.restante === 110000, String(excesso.restante));
}

// ================================== 6b. divida que começou no passado

/*
 * Cadastrar hoje um financiamento que ja corre ha um ano nao pode significar
 * registrar doze pagamentos so para o app parar de dizer "faltam 24 de 24".
 * Competencia vencida conta como paga por presuncao — e esse dinheiro ja saiu
 * da conta antes do saldo de partida, entao cobra-lo de novo seria contagem
 * dupla.
 */
console.log('\n6b. Divida que começou no passado');
{
  const AGORA = T(2026, 9, 15);
  const emprestimo = divida({
    id: 'emp',
    descricao: 'Consignado',
    valorTotal: 1200000,
    parcelas: 24,
    primeiraEm: T(2025, 9, 10),
  });

  igual(
    'parcela x prazo da parcelas todas iguais',
    valorDaParcela(1200000, 24, 1),
    valorDaParcela(1200000, 24, 2),
  );
  igual('e a parcela e exata', valorDaParcela(1200000, 24, 1), 50000);

  const base = dados({ dividas: [emprestimo] });
  const falta = compromissos(base, AGORA)[0]!.falta;
  igual('doze competencias vencidas contam como pagas', falta.parcelasRestantes, 12);
  igual('e o que falta e metade do total', falta.restante, 600000);
  igual('a proxima e a do mes corrente', falta.proxima, '2026-09');
  igual('o aPagar da carteira nao soma o passado', calcularCarteira(base, AGORA).aPagar, 600000);

  // ------------------------------------------------------ desconto em folha
  const cc = conta({
    id: 'cc',
    tipo: 'corrente',
    saldoInicial: 100000,
    saldoInicialEm: T(2026, 9, 1),
  });
  const salario = salarios('2026-06', '2026-09', 5, 300000, { contaId: 'cc' });
  const emFolha = { ...emprestimo, descontoEmFolha: true, contaId: 'cc' };
  const comFolha = dados({ contas: [cc], rendas: salario, dividas: [emFolha] });

  igual(
    'desconto em folha ja conta o mes corrente como pago',
    compromissos(comFolha, AGORA)[0]!.falta.parcelasRestantes,
    11,
  );
  igual(
    'e a parcela do mes sai do saldo da conta',
    saldoDaConta(cc, comFolha, AGORA).saldo,
    100000 + 300000 - 50000,
  );

  const semConta = dados({ contas: [cc], rendas: salario, dividas: [{ ...emFolha, contaId: null }] });
  igual(
    'sem conta informada, o desconto nao mexe em saldo nenhum',
    saldoDaConta(cc, semConta, AGORA).saldo,
    100000 + 300000,
  );

  const comPagamento = dados({
    contas: [cc],
    rendas: salario,
    dividas: [emFolha],
    transferencias: [
      transferencia({
        origemContaId: 'cc',
        alvo: 'divida',
        alvoId: 'emp',
        competencia: '2026-09',
        data: T(2026, 9, 5),
        valor: 50000,
      }),
    ],
  });
  igual(
    'pagamento registrado por cima nao desconta duas vezes',
    saldoDaConta(cc, comPagamento, AGORA).saldo,
    100000 + 300000 - 50000,
  );

  // -------------------------------------------- sem desconto em folha: lembra
  const porConta = dados({ contas: [cc], rendas: salario, dividas: [{ ...emprestimo, contaId: 'cc' }] });
  const cicloDoMes = compromissos(porConta, AGORA)[0]!.ciclos.find(
    (c) => c.competencia === '2026-09',
  );
  igual('sem desconto em folha, a parcela do mes fica em aberto', cicloDoMes?.restante, 50000);
  conferir('e ela nao e marcada como presumida', cicloDoMes?.presumido === false);

  // ------------------------------------------------------------- a previsao
  const linhas = projetar(porConta, { meses: 3, agora: AGORA });
  igual(
    'a previsao do mes corrente cobra a parcela em aberto',
    linhas.find((l) => l.mes === '2026-09')?.comprometido,
    50000,
  );
  igual(
    'e a do mes seguinte tambem',
    linhas.find((l) => l.mes === '2026-10')?.comprometido,
    50000,
  );
  igual(
    'com desconto em folha, o mes corrente ja nao cobra nada',
    projetar(comFolha, { meses: 3, agora: AGORA }).find((l) => l.mes === '2026-09')?.comprometido,
    0,
  );
}

// ==================================== 7. a migracao da recorrencia das entradas

/*
 * A recorrencia foi abandonada: entrada e lancamento. Mas ha regras antigas
 * gravadas, e apaga-las levaria meses de salario do saldo e do Resumo. A migracao
 * as transforma em lancamentos unicos por data que ja caiu — e o contrato dela e
 * que NENHUM NUMERO DE HOJE MUDA. E o que este teste confere, com os casos que
 * mais costumam estragar: aumento (a renda nova no dia 1, como a tela antiga a
 * criava), dia 31, anual, e saldo de partida no meio do periodo.
 */
console.log('\n7. A migracao da recorrencia: cada regra vira lancamentos, e nenhum numero muda');
{
  const AGORA = T(2026, 10, 8);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 3, 10) });

  const antiga = renda({
    id: 'antiga', data: T(2026, 1, 5), valor: 300000, periodicidade: 'mensal',
    encerradoEm: T(2026, 6, 30, 23), contaId: 'cc',
  });
  // A renda nova nasceu no dia 1 a meia-noite (assim `alterarRendaRecorrente` a criava).
  const nova = renda({
    id: 'nova', data: T(2026, 7, 1, 0), valor: 340000, periodicidade: 'mensal', contaId: 'cc',
  });
  const decimo = renda({
    id: 'dec', data: T(2025, 12, 20), valor: 300000, periodicidade: 'anual', contaId: 'cc',
  });
  const dia31 = renda({
    id: 'd31', data: T(2026, 1, 31), valor: 10000, periodicidade: 'mensal', contaId: 'cc',
  });
  const extra = renda({ id: 'ext', data: T(2026, 9, 12), valor: 50000, contaId: 'cc' });
  const antes = dados({ contas: [cc], rendas: [antiga, nova, decimo, dia31, extra] });

  // A mesma coisa que a porta faz, em memoria: filhas mais a lapide na mae.
  const migrar = (d: DadosFinanceiros, agora: number): DadosFinanceiros => {
    const rendas: Renda[] = [];
    for (const r of d.rendas) {
      const filhas = materializarRenda(r, agora);
      if (filhas.length === 0) rendas.push(r);
      else rendas.push({ ...r, excluidoEm: 1 }, ...filhas);
    }
    return { ...d, rendas };
  };
  const depois = migrar(antes, AGORA);
  const vivas = depois.rendas.filter((r) => r.excluidoEm === null);

  igual('nao sobra nenhuma regra recorrente viva', vivas.filter((r) => r.periodicidade !== 'unica').length, 0);
  // 6 (antiga) + 4 (nova, jul a out) + 1 (13o) + 9 (dia 31, jan a set) + o extra
  igual('uma entrada unica por data que ja caiu', vivas.length, 6 + 4 + 1 + 9 + 1);

  for (const mes of ['2026-03', '2026-05', '2026-07', '2026-09', '2026-10']) {
    const a = resumoDoMes(antes, mes, AGORA);
    const d = resumoDoMes(depois, mes, AGORA);
    igual(`${mes}: as entradas sao as mesmas`, d.entradas, a.entradas);
    igual(`${mes}: a sobra e a mesma`, d.sobra, a.sobra);
  }
  igual(
    'o saldo da conta e o mesmo',
    saldoDaConta(cc, depois, AGORA).saldo,
    saldoDaConta(cc, antes, AGORA).saldo,
  );
  igual(
    'o saldo em conta da carteira e o mesmo',
    calcularCarteira(depois, AGORA).saldoEmConta,
    calcularCarteira(antes, AGORA).saldoEmConta,
  );

  // ------------------------------------------------------ o que ela gera
  const filhasDaNova = materializarRenda(nova, AGORA);
  igual(
    'os ids sao deterministicos: regra e mes',
    filhasDaNova.map((f) => f.id).join(','),
    'nova:2026-07,nova:2026-08,nova:2026-09,nova:2026-10',
  );
  igual(
    'e iguais a cada chamada, para dois aparelhos gerarem as mesmas linhas',
    materializarRenda(nova, AGORA).map((f) => f.id).join(','),
    filhasDaNova.map((f) => f.id).join(','),
  );
  conferir('so entra o que ja caiu', filhasDaNova.every((f) => f.data <= AGORA));
  igual(
    'dia 31 em fevereiro cai no 28',
    new Date(materializarRenda(dia31, AGORA).find((f) => f.id === 'd31:2026-02')!.data).getDate(),
    28,
  );
  igual(
    'a filha leva o valor e a conta da regra',
    [filhasDaNova[0]!.valor, filhasDaNova[0]!.contaId].join('|'),
    '340000|cc',
  );
  conferir(
    'a filha e unica e sem fim',
    filhasDaNova.every((f) => f.periodicidade === 'unica' && f.encerradoEm === null),
  );
  igual('uma entrada unica nao e tocada', materializarRenda(extra, AGORA).length, 0);
  igual(
    'regra cuja primeira data ainda e futura espera',
    materializarRenda(renda({ data: T(2026, 12, 5), periodicidade: 'mensal' }), AGORA).length,
    0,
  );

  // ------------------------------------------------------- idempotencia
  igual('rodar de novo nao muda nada', migrar(depois, AGORA).rendas.length, depois.rendas.length);

  // O 13o chega de uma vez na regra legada e e lido certo ate migrar.
  igual('o 13o anual cai uma vez por ano', ocorrenciasDeRenda(decimo, T(2026, 12, 31)).length, 2);
}

// ========================================= 7b. a entrada estimada pela media

console.log('\n7b. A entrada estimada: media dos meses completos, so de caixa');
{
  const AGORA = T(2026, 10, 8);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 1, 1) });
  const vale = conta({ id: 'vale', tipo: 'vale', saldoInicial: 0, saldoInicialEm: T(2026, 1, 1) });

  const jul = salarios('2026-07', '2026-07', 5, 300000, { contaId: 'cc' });
  const ago = salarios('2026-08', '2026-08', 5, 340000, { contaId: 'cc' });
  const set = salarios('2026-09', '2026-09', 5, 320000, { contaId: 'cc' });
  const historico = dados({ contas: [cc, vale], rendas: [...jul, ...ago, ...set] });

  const e = estimarEntradaMensal(historico, AGORA);
  igual('a media dos tres meses completos', e.total, 320000);
  igual('usa os tres meses', e.mesesUsados, 3);
  conferir('com tres meses nao e estimativa fraca', !e.fraca);
  conferir('e nao e manual', !e.manual);
  conferir('ha base de entrada', temBaseDeEntrada(e));

  igual(
    'o mes corrente nao entra na media',
    estimarEntradaMensal(
      dados({
        contas: [cc],
        rendas: [...jul, ...ago, ...set, renda({ data: T(2026, 10, 5), valor: 999999, contaId: 'cc' })],
      }),
      AGORA,
    ).total,
    320000,
  );
  igual(
    'mes sem entrada nao puxa a media para baixo',
    estimarEntradaMensal(dados({ contas: [cc], rendas: [...jul, ...set] }), AGORA).total,
    310000,
  );
  igual(
    'recarga de vale nao entra na media',
    estimarEntradaMensal(
      dados({
        contas: [cc, vale],
        rendas: [...jul, ...ago, ...set, ...salarios('2026-07', '2026-09', 1, 80000, { contaId: 'vale' })],
      }),
      AGORA,
    ).total,
    320000,
  );

  const semHistorico = estimarEntradaMensal(dados({ contas: [cc] }), AGORA);
  igual('sem entrada nenhuma a estimativa e zero', semHistorico.total, 0);
  conferir('e nao ha base', !temBaseDeEntrada(semHistorico));
  const umMes = estimarEntradaMensal(dados({ contas: [cc], rendas: set }), AGORA);
  conferir('um mes so e estimativa fraca, mas ha base', umMes.fraca && temBaseDeEntrada(umMes));

  const manual = estimarEntradaMensal(historico, AGORA, 450000);
  igual('o valor digitado manda', manual.total, 450000);
  conferir('e e marcado como manual, com base', manual.manual && temBaseDeEntrada(manual));
  igual('zero digitado tambem vale', estimarEntradaMensal(historico, AGORA, 0).total, 0);
}

// ===================== 7c. a previsao com entrada estimada, sem degrau

console.log('\n7c. A previsao: o salario cair nao da degrau');
{
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 6, 1) });
  const vale = conta({ id: 'vale', tipo: 'vale', saldoInicial: 0, saldoInicialEm: T(2026, 6, 1) });
  const historico = salarios('2026-07', '2026-09', 5, 350000, { contaId: 'cc' });

  const dia4 = panorama(dados({ contas: [cc], rendas: historico }), { meses: 3, agora: T(2026, 10, 4, 12) });
  const salarioDeOutubro = renda({ data: T(2026, 10, 5, 8), valor: 350000, contaId: 'cc' });
  const dia6 = panorama(
    dados({ contas: [cc], rendas: [...historico, salarioDeOutubro] }),
    { meses: 3, agora: T(2026, 10, 6, 12) },
  );

  igual('no dia 4 o salario de outubro ainda e esperado', dia4.linhas[0]!.entradas, 350000);
  igual('no dia 6 ele ja esta na conta e nao falta entrar nada', dia6.linhas[0]!.entradas, 0);
  igual('o saldo previsto para o fim do mes nao da degrau', dia6.fechaOMesCom, dia4.fechaOMesCom);
  igual('e vale o saldo mais o que falta entrar', dia4.fechaOMesCom, 100000 + 3 * 350000 + 350000);

  igual('o mes seguinte espera a entrada tipica', dia6.linhas[1]!.entradas, 350000);

  const comExtra = panorama(
    dados({
      contas: [cc],
      rendas: [...historico, salarioDeOutubro, renda({ data: T(2026, 10, 25), valor: 500000, contaId: 'cc' })],
    }),
    { meses: 3, agora: T(2026, 10, 6, 12) },
  );
  igual('entrada lancada com data futura vale quando e maior', comExtra.linhas[0]!.entradas, 500000);

  const semBase = panorama(dados({ contas: [cc] }), { meses: 3, agora: T(2026, 10, 6, 12) });
  igual('sem historico nao ha entrada prevista', semBase.linhas[1]!.entradas, 0);
  conferir('e a estimativa avisa que nao ha base', !temBaseDeEntrada(semBase.estimativaEntrada));

  const manual = projetar(dados({ contas: [cc] }), { meses: 3, agora: T(2026, 10, 6, 12), entradaManual: 400000 });
  igual('a entrada digitada alimenta a previsao', manual[1]!.entradas, 400000);

  const comVale = panorama(
    dados({
      contas: [cc, vale],
      rendas: [...historico, ...salarios('2026-07', '2026-09', 1, 80000, { contaId: 'vale' })],
    }),
    { meses: 3, agora: T(2026, 10, 6, 12) },
  );
  igual('recarga de vale nao vira entrada prevista', comVale.linhas[1]!.entradas, 350000);
}

// ==================== 7d. o dia do salario sem regra

console.log('\n7d. O dia do salario vem das entradas, e o cartao mostra a ultima e a proxima');
{
  const AGORA = T(2026, 10, 8);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 1, 1) });
  const vale = conta({ id: 'vale', tipo: 'vale', saldoInicial: 0, saldoInicialEm: T(2026, 1, 1) });
  const salario = salarios('2026-07', '2026-10', 5, 350000, { contaId: 'cc' });

  igual('o dia do salario e o da maior entrada recente', diaDoSalario(dados({ contas: [cc], rendas: salario }), AGORA), 5);
  igual(
    'um extra pequeno nao muda o dia',
    diaDoSalario(
      dados({ contas: [cc], rendas: [...salario, renda({ data: T(2026, 9, 20), valor: 50000, contaId: 'cc' })] }),
      AGORA,
    ),
    5,
  );
  igual(
    'beneficio em vale nao e salario',
    diaDoSalario(
      dados({
        contas: [cc, vale],
        rendas: [...salario, renda({ data: T(2026, 9, 1), valor: 900000, contaId: 'vale' })],
      }),
      AGORA,
    ),
    5,
  );
  igual(
    'entrada de ha mais de tres meses nao conta',
    diaDoSalario(
      dados({ contas: [cc], rendas: [renda({ data: T(2026, 1, 5), valor: 350000, contaId: 'cc' })] }),
      AGORA,
    ),
    null,
  );
  igual(
    'empate de valor: vale a mais recente',
    diaDoSalario(
      dados({
        contas: [cc],
        rendas: [
          renda({ data: T(2026, 8, 10), valor: 100000, contaId: 'cc' }),
          renda({ data: T(2026, 9, 20), valor: 100000, contaId: 'cc' }),
        ],
      }),
      AGORA,
    ),
    20,
  );
  igual('sem entrada nao ha dia', diaDoSalario(dados({ contas: [cc] }), AGORA), null);

  const consignado = divida({
    descontoEmFolha: true,
    contaId: 'cc',
    primeiraEm: T(2026, 7, 17),
    valorTotal: 120000,
    parcelas: 12,
  });
  igual(
    'o consignado sai no dia do salario',
    new Date(dataDoDescontoEmFolha(consignado, dados({ contas: [cc], rendas: salario }), '2026-10', AGORA)).getDate(),
    5,
  );
  igual(
    'sem entrada recente cai no dia da propria divida',
    new Date(dataDoDescontoEmFolha(consignado, dados({ contas: [cc] }), '2026-10', AGORA)).getDate(),
    17,
  );
}

// ================================================= 8. saldo e compra solta

console.log('\n8. Saldo inicial e compra sem conta');
{
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 9, 15) });
  const base = dados({
    contas: [cc],
    compras: [
      compra({ data: T(2026, 9, 10), total: 50000, contaId: 'cc' }),
      compra({ data: T(2026, 9, 20), total: 20000, contaId: 'cc' }),
    ],
  });
  igual('compra ANTES do saldo informado e ignorada', saldoDaConta(cc, base, T(2026, 9, 30)).saldo, 80000);

  const reinformado = dados({
    ...base,
    contas: [{ ...cc, saldoInicial: 70000, saldoInicialEm: T(2026, 9, 25) }],
  });
  igual('reinformar o saldo zera tudo que veio antes', saldoDaConta(reinformado.contas[0]!, reinformado, T(2026, 9, 30)).saldo, 70000);

  const solta = dados({
    contas: [cc],
    compras: [compra({ data: T(2026, 9, 20), total: 21000, contaId: null })],
  });
  const carteira = calcularCarteira(solta, T(2026, 9, 30));
  igual('compra sem conta nao mexe no saldo', carteira.saldoEmConta, 100000);
  igual('mas aparece no aviso', carteira.semConta.quantidade, 1);
  igual('com o valor somado', carteira.semConta.total, 21000);
  igual('e acharConta devolve undefined', acharConta(solta.contas, null), undefined);
}

// ============================================ 8b. entradas no saldo da conta

/*
 * A lacuna que deixou um bug real passar: ate aqui NENHUM teste verificava que
 * uma entrada aumenta o saldo de uma conta. O proprio helper `renda()` cria com
 * `contaId: null`, entao a suite exercitava so o caminho em que a entrada nao
 * entra em saldo nenhum — e passava.
 */
console.log('\n8b. Entradas somam no saldo, e a hora nao decide');
{
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 9, 1) });

  const salario = renda({ data: T(2026, 9, 5), valor: 300000, contaId: 'cc' });
  const extra = renda({ data: T(2026, 9, 12), valor: 50000, contaId: 'cc' });
  const base = dados({ contas: [cc], rendas: [salario, extra] });

  igual('salario e extra somam no saldo da conta', saldoDaConta(cc, base, T(2026, 9, 30)).saldo, 350000);
  igual('e o resumo do mes mostra o MESMO total', resumoDoMes(base, '2026-09', T(2026, 9, 30)).entradas, 350000);

  // O CASO RELATADO: entradas cadastradas as 14h, saldo informado as 15h do
  // MESMO dia. Com o corte por instante, as duas sumiam do saldo sem aviso.
  const mesmoDia = dados({
    contas: [{ ...cc, saldoInicialEm: T(2026, 9, 20, 15) }],
    rendas: [
      renda({ data: T(2026, 9, 20, 14), valor: 300000, periodicidade: 'unica', contaId: 'cc' }),
      renda({ data: T(2026, 9, 20, 14), valor: 50000, periodicidade: 'unica', contaId: 'cc' }),
    ],
  });
  igual(
    'entrada do mesmo dia conta, mesmo lançada antes da hora do saldo',
    saldoDaConta(mesmoDia.contas[0]!, mesmoDia, T(2026, 9, 30)).saldo,
    350000,
  );

  // Mas o corte continua existindo: um DIA antes nao conta, senao o valor
  // informado somaria de novo o que ja estava dentro dele.
  const diaAnterior = dados({
    contas: [{ ...cc, saldoInicialEm: T(2026, 9, 20, 15) }],
    rendas: [renda({ data: T(2026, 9, 19, 23), valor: 300000, periodicidade: 'unica', contaId: 'cc' })],
  });
  igual(
    'entrada do dia anterior ao corte nao conta',
    saldoDaConta(diaAnterior.contas[0]!, diaAnterior, T(2026, 9, 30)).saldo,
    0,
  );

  /*
   * LEITURA LEGADA. A regressao mais cara de uma rodada anterior, e a que a
   * propria fabrica de teste escondia (a recorrencia foi abandonada, mas a regra
   * antiga ainda e lida ate a migracao rodar): `T()` monta datas com segundos zerados, mas `criarRenda` grava
   * `Date.now()`, que tem segundos. A ocorrencia e montada com segundos em zero,
   * entao ela caia uns segundos ANTES de `renda.data` e era descartada — toda
   * renda recorrente recem-cadastrada contava zero no proprio mes.
   */
  const comSegundos = T(2026, 9, 5) + 37_000;
  igual(
    'regra recorrente legada, criada com segundos, conta no proprio mes',
    ocorrenciasDeRenda(
      renda({ data: comSegundos, valor: 300000, periodicidade: 'mensal' }),
      T(2026, 9, 30),
    ).length,
    1,
  );

  const solta = dados({
    contas: [cc],
    rendas: [renda({ data: T(2026, 9, 10), valor: 80000, periodicidade: 'unica', contaId: null })],
  });
  const carteira = calcularCarteira(solta, T(2026, 9, 30));
  igual('entrada sem conta nao mexe no saldo', carteira.saldoEmConta, 0);
  igual('mas aparece no aviso', carteira.rendasSemConta.quantidade, 1);
  igual('com o valor somado', carteira.rendasSemConta.total, 80000);
}

// ================================================== 9. grupos e estimativa

console.log('\n9. Os grupos de categoria, e a distorcao da geladeira');
{
  const semGrupo = CATEGORIAS.filter((c) => !(c in GRUPO_DA_CATEGORIA));
  conferir('toda categoria da lista tem grupo', semGrupo.length === 0, semGrupo.join(', '));
  igual('categoria desconhecida cai em variavel', grupoDaCategoria('Inventada pelo usuário'), 'variavel');
  igual('Contas de casa e fixo', grupoDaCategoria('Contas de casa'), 'fixo');
  igual('Casa e eventual', grupoDaCategoria('Casa'), 'eventual');

  const agora = T(2026, 9, 15);
  const cc = conta({ id: 'cc', tipo: 'corrente' });

  const comum = ['2026-06', '2026-07', '2026-08'].map((mes) =>
    compra({ data: T(Number(mes.slice(0, 4)), Number(mes.slice(5)), 10), total: 60000, categoria: 'Mercado', contaId: 'cc' }),
  );

  const semGeladeira = estimarGastoCorrente(dados({ contas: [cc], compras: comum }), agora);
  igual('a media dos tres meses de mercado', semGeladeira.variavel, 60000);
  igual('sem fixos, o total e so o variavel', semGeladeira.total, 60000);

  const comGeladeira = estimarGastoCorrente(
    dados({
      contas: [cc],
      compras: [...comum, compra({ data: T(2026, 8, 12), total: 120000, categoria: 'Casa', contaId: 'cc' })],
    }),
    agora,
  );
  igual('a geladeira (eventual) NAO entra no estimado', comGeladeira.total, 60000);

  const comLuz = estimarGastoCorrente(
    dados({
      contas: [cc],
      compras: [...comum, compra({ data: T(2026, 8, 12), total: 120000, categoria: 'Contas de casa', contaId: 'cc' })],
    }),
    agora,
  );
  conferir('mas o mesmo valor em categoria fixa entra', comLuz.total > 60000, String(comLuz.total));
  igual('e entra na coluna dos fixos', comLuz.fixo, 40000);

  const magro = estimarGastoCorrente(
    dados({ contas: [cc], compras: [compra({ data: T(2026, 8, 10), total: 50000, contaId: 'cc' })] }),
    agora,
  );
  conferir('com um mes so, a estimativa vem marcada como fraca', magro.fraca, String(magro.mesesUsados));

  const vazia = estimarGastoCorrente(dados(), agora);
  igual('sem historico nenhum, a estimativa e zero e nao um chute', vazia.total, 0);
  conferir('e vem marcada como fraca', vazia.fraca);

  const manual = estimarGastoCorrente(dados({ contas: [cc], compras: comum }), agora, 90000);
  igual('o numero digitado pelo usuario manda', manual.total, 90000);
  conferir('e a tela sabe que foi manual', manual.manual);

  const comTransferencia = estimarGastoCorrente(
    dados({
      contas: [cc],
      compras: comum,
      transferencias: [transferencia({ origemContaId: 'cc', data: T(2026, 8, 20), valor: 500000 })],
    }),
    agora,
  );
  igual('pagamento de fatura nao entra no gasto estimado', comTransferencia.total, 60000);
}

// ==================================================== 10. previsao

console.log('\n10. A previsao');
{
  const agora = T(2026, 9, 1, 0);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 8, 31) });
  const cartao = conta({ id: 'cartao', tipo: 'credito', diaFechamento: 20, diaVencimento: 27 });
  // Tres meses de salario lancado: e deles que a previsao tira a entrada tipica.
  const salario = salarios('2026-06', '2026-08', 5, 300000);

  const base = dados({ contas: [cc, cartao], rendas: salario });
  const linhas = projetar(base, { meses: 12, agora });

  igual('doze linhas', linhas.length, 12);
  igual('a primeira e o mes corrente', linhas[0]!.mes, '2026-09');
  conferir('a primeira e marcada como parcial', linhas[0]!.parcial);
  conferir('as demais nao sao parciais', linhas.slice(1).every((l) => !l.parcial));

  const outubro = linhas[1]!;
  igual('outubro recebe o salario', outubro.entradas, 300000);
  igual('sem compromisso, o comprometido e zero', outubro.comprometido, 0);
  igual('a sobra e entradas menos estimado', outubro.sobra, outubro.entradas - outubro.estimado);

  // Uma compra em 12x tem que pesar em 12 meses e em nenhum a mais.
  const geladeira = compra({ data: T(2026, 9, 10), total: 120000, parcelas: 12, contaId: 'cartao', categoria: 'Casa' });
  const comGeladeira = dados({ ...base, compras: [geladeira] });
  const depois = projetar(comGeladeira, { meses: 18, agora });

  const comComprometido = depois.filter((l) => l.comprometido > 0);
  igual('doze meses ganham comprometido, e nenhum a mais', comComprometido.length, 12);
  igual('cada um com o valor da parcela', comComprometido[0]!.comprometido, 10000);
  conferir(
    'e o comprometido acaba junto com as parcelas',
    depois.filter((l) => l.mes > '2027-08').every((l) => l.comprometido === 0),
  );

  // A mesma compra, mas feita num mes que JA esta na media historica: a primeira
  // parcela nao pode contar de novo, senao o mes seria cobrado duas vezes.
  const antiga = compra({ data: T(2026, 7, 10), total: 120000, parcelas: 12, contaId: 'cartao', categoria: 'Mercado' });
  const comAntiga = projetar(dados({ ...base, compras: [antiga] }), { meses: 18, agora });
  const julho = comAntiga.filter((l) => l.comprometido > 0);
  conferir(
    'compra de mes passado nao recobra a 1a parcela (ela ja esta na media)',
    julho.every((l) => l.mes >= '2026-09'),
    julho.map((l) => l.mes).join(','),
  );

  const menor = depois.reduce((pior, l) => (l.saldoAcumulado < pior.saldoAcumulado ? l : pior), depois[0]!);
  conferir(
    'o mes mais apertado e mesmo o de menor saldo acumulado',
    depois.every((l) => l.saldoAcumulado >= menor.saldoAcumulado),
  );

  const saldoPrevisto = linhas[1]!.saldoAcumulado;
  igual(
    'o saldo acumulado soma a sobra do mes anterior',
    saldoPrevisto,
    linhas[0]!.saldoAcumulado + linhas[1]!.sobra,
  );
}

// ============================================ 10b. o numero da tela inicial

console.log('\n10b. O numero da tela inicial nao troca de sinal no dia do pagamento');
{
  // A tela inicial mostrava a sobra do mes PARCIAL: o que falta entrar menos o
  // que falta sair. No dia seguinte ao salario nao falta entrar nada, e o numero
  // ficava vermelho ate o fim do mes sem que nada de ruim tivesse acontecido.
  // O saldo previsto para o fim do mes nao tem esse degrau: o salario so muda
  // de lugar, de "vai entrar" para "ja esta na conta".
  const cc = conta({ id: 'cc10', tipo: 'corrente', saldoInicial: 50000, saldoInicialEm: T(2026, 9, 30) });
  const salario = salarios('2026-07', '2026-09', 5, 350000, { contaId: 'cc10' });
  const historico = [7, 8, 9].map((mes) =>
    compra({ data: T(2026, mes, 10), total: 120000, contaId: 'cc10' }),
  );
  // No dia 4 o salario de outubro nao caiu; no dia 6 ja foi lancado.
  const salarioDeOutubro = renda({ data: T(2026, 10, 5, 8), valor: 350000, contaId: 'cc10' });
  const dDia4 = dados({ contas: [cc], rendas: salario, compras: historico });
  const dDia6 = dados({ contas: [cc], rendas: [...salario, salarioDeOutubro], compras: historico });

  const dia4 = panorama(dDia4, { meses: 12, agora: T(2026, 10, 4) });
  const dia6 = panorama(dDia6, { meses: 12, agora: T(2026, 10, 6) });

  conferir('no dia 4 a sobra parcial e positiva: o salario ainda vai cair', dia4.sobraDoMes > 0, String(dia4.sobraDoMes));
  conferir('no dia 6 ela fica negativa, so porque o salario caiu', dia6.sobraDoMes < 0, String(dia6.sobraDoMes));

  conferir('o saldo previsto para o fim do mes e positivo no dia 4', (dia4.fechaOMesCom ?? -1) > 0, String(dia4.fechaOMesCom));
  conferir('e continua positivo no dia 6', (dia6.fechaOMesCom ?? -1) > 0, String(dia6.fechaOMesCom));
  igual(
    'entre os dois dias ele anda so o gasto estimado que deixou de faltar',
    (dia6.fechaOMesCom ?? 0) - (dia4.fechaOMesCom ?? 0),
    dia4.linhas[0]!.estimado - dia6.linhas[0]!.estimado,
  );
  igual(
    'e o saldo em conta mais o que resta do mes',
    dia6.fechaOMesCom,
    dia6.carteira.saldoEmConta + dia6.linhas[0]!.sobra,
  );

  // Principio 0: sem conta de dinheiro nao ha saldo de onde partir, e prever o
  // fechamento seria devolver a mesma sobra parcial com outro nome.
  const soRenda = panorama(dados({ rendas: [renda({ valor: 350000 })] }), { meses: 12, agora: T(2026, 10, 6) });
  igual('sem conta de dinheiro nao ha fechamento para prever', soRenda.fechaOMesCom, null);

  const soValeECartao = panorama(
    dados({
      contas: [conta({ id: 'va10', tipo: 'vale' }), conta({ id: 'cr10', tipo: 'credito' })],
      rendas: [renda({ valor: 350000 })],
    }),
    { meses: 12, agora: T(2026, 10, 6) },
  );
  igual('vale e cartao nao sao conta de dinheiro', soValeECartao.fechaOMesCom, null);
}

// ==================================================== 11. simulador

console.log('\n11. O simulador');
{
  const agora = T(2026, 9, 1, 0);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 8, 31) });
  const cartao = conta({ id: 'cartao', tipo: 'credito', diaFechamento: 20, diaVencimento: 27, limite: 500000 });
  const salario = salarios('2026-06', '2026-08', 5, 300000);
  const base = dados({ contas: [cc, cartao], rendas: salario });
  const opcoes = { meses: 12, agora };

  const pequena = simular(base, { valor: 5000, contaId: 'cartao', parcelas: 1, data: agora, categoria: 'Mercado' }, opcoes);
  igual('compra pequena cabe', pequena.veredito, 'cabe');
  igual('a parcela e o valor inteiro', pequena.parcela, 5000);
  igual('cai na fatura de setembro', pequena.competenciaInicial, '2026-09');
  conferir('e informa os dias ate pagar', (pequena.diasAtePagar ?? 0) > 0);

  const enorme = simular(base, { valor: 900000, contaId: 'cartao', parcelas: 2, data: agora, categoria: 'Casa' }, opcoes);
  igual('compra enorme estoura', enorme.veredito, 'estoura');
  conferir('e aponta os meses negativos', enorme.mesesNegativos.length > 0);

  conferir(
    'a projecao "antes" nao muda com a simulacao',
    JSON.stringify(pequena.antes) === JSON.stringify(projetar(base, opcoes)),
  );
  conferir(
    'e a "depois" e diferente da "antes"',
    JSON.stringify(enorme.antes) !== JSON.stringify(enorme.depois),
  );

  const doLimite = simular(base, { valor: 250000, contaId: 'cartao', parcelas: 10, data: agora, categoria: 'Casa' }, opcoes);
  igual('metade do limite de R$ 5.000 e 0,5', doLimite.usoDoLimite, 0.5);

  // O limite entra no veredito. R$ 6.000 em 12x sao R$ 500 por mes contra um
  // salario de R$ 3.000: nenhum mes fica negativo, e o veredito dizia "cabe"
  // para uma compra que a maquininha recusa. A tela mostrava o cartao verde e,
  // embaixo dele, um aviso vermelho dizendo o contrario.
  const alemDoLimite = simular(base, { valor: 600000, contaId: 'cartao', parcelas: 12, data: agora, categoria: 'Casa' }, opcoes);
  igual('acima do limite, nenhum mes fica negativo', alemDoLimite.mesesNegativos.length, 0);
  igual('faltam R$ 1.000 de limite', alemDoLimite.faltaDeLimite, 100000);
  igual('e o veredito e estoura: a compra nao passa', alemDoLimite.veredito, 'estoura');

  const noLimite = simular(base, { valor: 500000, contaId: 'cartao', parcelas: 12, data: agora, categoria: 'Casa' }, opcoes);
  igual('no limite exato nao falta nada', noLimite.faltaDeLimite, 0);
  igual('e a compra ainda cabe', noLimite.veredito, 'cabe');

  // Limite zero e "nao informado", nao "sem limite nenhum": sem o dado, o
  // veredito nao pode acusar estouro.
  const semLimite = dados({ contas: [cc, conta({ id: 'livre', tipo: 'credito', limite: 0 })], rendas: salario });
  const livre = simular(semLimite, { valor: 600000, contaId: 'livre', parcelas: 12, data: agora, categoria: 'Casa' }, opcoes);
  igual('cartao sem limite informado nao estoura por limite', livre.veredito, 'cabe');

  const aVista = simular(base, { valor: 5000, contaId: 'cc', parcelas: 1, data: agora, categoria: 'Mercado' }, opcoes);
  igual('compra a vista nao tem fatura', aVista.competenciaInicial, null);
  igual('nem dias ate pagar', aVista.diasAtePagar, null);

  const meta: Meta = {
    id: 'm1',
    descricao: 'Moto',
    valorAlvo: 1500000,
    guardado: 0,
    reservaMensal: 0,
    prazoEm: null,
    ordem: 0,
    atualizadoEm: 0,
    excluidoEm: null,
  };
  const comMeta = dados({ ...base, metas: [meta] });
  const impacto = simular(comMeta, { valor: 200000, contaId: 'cartao', parcelas: 10, data: agora, categoria: 'Casa' }, opcoes);
  conferir('a compra atrasa a meta', impacto.metasAtrasadas.length > 0, JSON.stringify(impacto.metasAtrasadas));
}

// ======================================================== 12. metas

console.log('\n12. As metas, nos dois sentidos');
{
  const agora = T(2026, 9, 1);
  const meta: Meta = {
    id: 'm',
    descricao: 'Moto',
    valorAlvo: 1500000,
    guardado: 300000,
    reservaMensal: 40000,
    prazoEm: null,
    ordem: 0,
    atualizadoEm: 0,
    excluidoEm: null,
  };

  const plano = planejarMeta(meta, 50000, agora);
  igual('falta R$ 12.000', plano.falta, 1200000);
  igual('a 20% do alvo', Math.round(plano.progresso * 100), 20);
  igual('a R$ 400/mes, sao 30 meses', plano.mesesAteAlcancar, 30);
  igual('chegando em marco/2029', plano.competenciaAlvo, somarMeses('2026-09', 30));

  const comPrazo = planejarMeta({ ...meta, prazoEm: T(2027, 9, 1) }, 50000, agora);
  igual('em 12 meses, precisa de R$ 1.000/mes', comPrazo.reservaNecessaria, 100000);
  igual('o que NAO cabe numa sobra de R$ 500', comPrazo.cabeNaSobra, false);

  const folgada = planejarMeta({ ...meta, prazoEm: T(2029, 9, 1) }, 50000, agora);
  igual('em 36 meses, cabe', folgada.cabeNaSobra, true);

  // Os dois sentidos sao a mesma equacao: aplicar a reserva exigida devolve o prazo.
  const aplicada = planejarMeta(
    { ...meta, prazoEm: null, reservaMensal: comPrazo.reservaNecessaria! },
    50000,
    agora,
  );
  igual('aplicar a reserva exigida devolve o prazo pedido', aplicada.mesesAteAlcancar, 12);

  const pronta = planejarMeta({ ...meta, guardado: 1500000 }, 50000, agora);
  igual('meta cumprida nao falta nada', pronta.falta, 0);
  igual('e leva zero mes', pronta.mesesAteAlcancar, 0);

  // A reserva tem que aparecer como saida comprometida na projecao.
  const base = dados({
    contas: [conta({ id: 'cc', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 8, 1) })],
    rendas: salarios('2026-06', '2026-08', 5, 300000),
    metas: [meta],
  });
  const semMeta = projetar({ ...base, metas: [] }, { meses: 6, agora });
  const comMetaProj = projetar(base, { meses: 6, agora });
  igual('a reserva entra na linha da previsao', comMetaProj[1]!.reservaMetas, 40000);
  igual(
    'e derruba a sobra em exatamente a reserva',
    semMeta[1]!.sobra - comMetaProj[1]!.sobra,
    40000,
  );
}

// ======================================================== 13. planos

console.log('\n13. Os limites do plano');
{
  igual('o gratis preve 3 meses', limitesDo('gratis').mesesDePrevisao, 3);
  igual('o pago preve 12', limitesDo('pago').mesesDePrevisao, 12);
  igual('o gratis tem 1 meta', limitesDo('gratis').metas, 1);
  igual('e a IA e so do pago', limitesDo('gratis').ia, false);
  conferir('a IA do pago esta ligada', limitesDo('pago').ia);

  const agora = T(2026, 9, 1);
  const base = dados({ rendas: [renda({ data: T(2026, 1, 5) })] });
  igual('a projecao respeita o horizonte pedido', projetar(base, { meses: 3, agora }).length, 3);

  // O modelo da IA vem de variavel de ambiente, entao chega como texto digitado
  // num painel. Erro de digitacao tem de cair no padrao, e nao numa chamada que
  // so falha na hora da analise, com mensagem que nao aponta para a variavel.
  igual('sem variavel, a IA usa o modelo padrao', modeloValido(undefined), 'claude-haiku-5-5');
  igual('um modelo da lista e aceito', modeloValido('claude-opus-5-5'), 'claude-opus-5-5');
  igual('nome desconhecido cai no padrao', modeloValido('claude-opus-55'), MODELO_DE_IA_PADRAO);
  igual(
    'o haiku 4.5 fica fora: ele rejeita o parametro de esforco que a chamada envia',
    modeloValido('claude-haiku-4-5'),
    MODELO_DE_IA_PADRAO,
  );
  conferir('o padrao esta na lista', MODELOS_DE_IA.includes(MODELO_DE_IA_PADRAO));
}

// ================================================= 14. categorizacao

console.log('\n14. A cascata da categorizacao');
{
  const historico = new Map<string, UsoDaDescricao>([
    ['bom preco', { categoria: 'Mercado', vezes: 12 }],
    ['padaria da esquina', { categoria: 'Comer fora', vezes: 1 }],
  ]);
  const porItem = new Map<string, string>([
    ['dipirona', 'Farmácia'],
    ['band aid', 'Farmácia'],
    ['arroz', 'Mercado'],
  ]);
  const regras: RegraCategoria[] = [
    { id: 'r1', termo: 'posto', categoria: 'Combustível', ordem: 0, atualizadoEm: 0, excluidoEm: null },
    { id: 'r2', termo: 'bom preco', categoria: 'Casa', ordem: 1, atualizadoEm: 0, excluidoEm: null },
  ];
  const vazio = { regras: [] as RegraCategoria[], historico, porItem };

  const porRegra = adivinharCategoria({ ...vazio, regras, descricao: 'Posto Shell da BR', itens: [] });
  igual('a regra do usuario vence', porRegra.categoria, 'Combustível');
  igual('com confianca de certeza', porRegra.confianca, 'certeza');
  conferir('e o motivo cita a regra', porRegra.motivo.includes('posto'), porRegra.motivo);

  const regraVenceHistorico = adivinharCategoria({ ...vazio, regras, descricao: 'Bom Preço', itens: [] });
  igual('a regra vence ate o historico', regraVenceHistorico.categoria, 'Casa');

  const porHistorico = adivinharCategoria({ ...vazio, descricao: 'Bom Preço', itens: [] });
  igual('sem regra, o historico manda', porHistorico.categoria, 'Mercado');
  igual('com confianca alta a partir de 3 vezes', porHistorico.confianca, 'alta');
  conferir('e o motivo diz quantas vezes', porHistorico.motivo.includes('12'), porHistorico.motivo);

  const poucoHistorico = adivinharCategoria({ ...vazio, descricao: 'Padaria da Esquina', itens: [] });
  igual('uma vez so da confianca media', poucoHistorico.confianca, 'media');

  const porItens = adivinharCategoria({
    ...vazio,
    descricao: 'Loja que o app nunca viu',
    itens: ['Dipirona', 'Band aid'],
  });
  igual('os itens votam', porItens.categoria, 'Farmácia');
  igual('com confianca media', porItens.confianca, 'media');

  const empate = adivinharCategoria({
    ...vazio,
    descricao: 'Loja desconhecida',
    itens: ['Dipirona', 'Arroz'],
  });
  conferir('empate entre itens nao decide nada', empate.categoria === null, String(empate.categoria));

  const porPalavra = adivinharCategoria({ ...vazio, descricao: 'Drogaria São Paulo', itens: [] });
  igual('a palavra-chave embutida pega', porPalavra.categoria, 'Farmácia');

  const nada = adivinharCategoria({ ...vazio, descricao: 'Xyz Qwe', itens: [] });
  igual('sem sinal nenhum nao inventa categoria', nada.categoria, null);
  igual('e a confianca e nenhuma', nada.confianca, 'nenhuma');

  // O termo curto so casa palavra inteira: "luz" nao pode casar em "Luzia".
  const luzia = adivinharCategoria({ ...vazio, descricao: 'Mercado da Luzia', itens: [] });
  conferir(
    'termo curto nao casa dentro de outra palavra',
    luzia.categoria !== 'Contas de casa',
    String(luzia.categoria),
  );
  const contaDeLuz = adivinharCategoria({ ...vazio, descricao: 'Conta de luz', itens: [] });
  igual('mas casa a palavra inteira', contaDeLuz.categoria, 'Contas de casa');

  conferir('modo automatico aplica confianca alta', deveAplicarSozinho(porHistorico, 'automatico'));
  conferir('modo automatico NAO aplica confianca media', !deveAplicarSozinho(poucoHistorico, 'automatico'));
  conferir('modo sugerir nunca aplica sozinho', !deveAplicarSozinho(porRegra, 'sugerir'));
  conferir('modo desligado tambem nao', !deveAplicarSozinho(porRegra, 'desligado'));

  const resumo = resumirHistorico([
    compra({ descricao: 'Bom Preço', categoria: 'Mercado' }),
    compra({ descricao: 'bom preco', categoria: 'Mercado' }),
    compra({ descricao: 'BOM PREÇO', categoria: 'Casa' }),
  ]);
  igual('o historico normaliza acento e caixa', resumo.get('bom preco')?.vezes, 2);
  igual('e fica com a categoria mais usada', resumo.get('bom preco')?.categoria, 'Mercado');

  const comLapide = resumirHistorico([
    compra({ descricao: 'Sumida', categoria: 'Mercado', excluidoEm: 1 }),
  ]);
  igual('compra excluida nao ensina nada', comLapide.size, 0);

  // A compra em edicao ja esta no banco com a categoria que HERDOU. Sem tira-la
  // da conta, o palpite aprende com ela mesma e confirma o que estava errado —
  // e ai nenhum outro sinal da cascata chega a ser consultado.
  const emEdicao = compra({ id: 'atual', descricao: 'Drogaria Central', categoria: 'Mercado' });
  const semExcecao = resumirHistorico([emEdicao]);
  igual('sem excecao, a compra ensina o app sobre ela mesma', semExcecao.size, 1);

  const comExcecao = resumirHistorico([emEdicao], 'atual');
  igual('com a excecao, ela nao se ensina', comExcecao.size, 0);

  const palpiteLimpo = adivinharCategoria({
    regras: [],
    historico: comExcecao,
    porItem: new Map(),
    descricao: 'Drogaria Central',
    itens: [],
  });
  igual('e ai a palavra-chave consegue falar', palpiteLimpo.categoria, 'Farmácia');
}

// =================================================== 15. sugestoes

console.log('\n15. As sugestoes de item');
{
  conferir('"ninho leite" acha "leite ninho"', casaTermo('leite ninho integral', 'ninho leite'));
  conferir('"arr" acha "arroz"', casaTermo('arroz branco', 'arr'));
  conferir('palavra que nao existe nao casa', !casaTermo('arroz branco', 'feijao'));
  conferir('termo vazio casa com tudo', casaTermo('qualquer coisa', ''));

  const agora = T(2026, 9, 15);
  igual('comprado hoje vale 1,0', fatorDeRecencia(agora, agora), 1);
  igual('60 dias atras vale 0,6', fatorDeRecencia(agora - 60 * 86_400_000, agora), 0.6);
  igual('120 dias atras vale 0,3', fatorDeRecencia(agora - 120 * 86_400_000, agora), 0.3);
  igual('um ano atras vale 0,1', fatorDeRecencia(agora - 365 * 86_400_000, agora), 0.1);

  const antigoMuitoComprado = {
    chave: 'panetone',
    vezes: 30,
    ultimaCompraEm: agora - 365 * 86_400_000,
    ultimaCategoria: 'Mercado',
  };
  const recenteHabitual = {
    chave: 'pao',
    vezes: 4,
    ultimaCompraEm: agora - 3 * 86_400_000,
    ultimaCategoria: 'Mercado',
  };
  const ordenado = ordenarSugestoes([antigoMuitoComprado, recenteHabitual], '', agora);
  igual(
    'o que voce compra toda semana vence o do ano passado',
    ordenado[0]!.chave,
    'pao',
  );

  const daCategoria = {
    chave: 'dipirona',
    vezes: 4,
    ultimaCompraEm: agora - 3 * 86_400_000,
    ultimaCategoria: 'Farmácia',
  };
  const comBonus = ordenarSugestoes([recenteHabitual, daCategoria], '', agora, 'Farmácia');
  igual('item da mesma categoria da compra vem na frente', comBonus[0]!.chave, 'dipirona');

  const comecaCom = ordenarSugestoes(
    [
      { chave: 'leite ninho', vezes: 1, ultimaCompraEm: agora, ultimaCategoria: '' },
      { chave: 'ninho leite', vezes: 50, ultimaCompraEm: agora, ultimaCategoria: '' },
    ],
    'ninho',
    agora,
  );
  igual('quem começa com o termo vem antes', comecaCom[0]!.chave, 'ninho leite');
}

// ============================================== 16. datas sempre em pt-BR

/*
 * Duas coisas que ja quebraram de verdade e nao davam erro nenhum:
 *
 * - `Intl.DateTimeFormat('pt-BR')` cai na locale do SISTEMA quando o runtime
 *   nao tem os dados de pt-BR, e a mesma data vira 09/01/2026 num aparelho e
 *   01/09/2026 no outro. Por isso a data e montada a mao, e por isso isto e
 *   testado: o teste roda no Node, que e outro runtime, e tem que dar igual.
 * - `deInputData` teve as barras invertidas perdidas na edicao
 *   (`(d{4})` em vez de `(\\d{4})`), entao NUNCA casava e o campo de data da
 *   conta engolia em silencio tudo que era digitado.
 */
console.log('\n16. Datas sempre em pt-BR, sem depender do sistema');
{
  const quando = new Date(2026, 8, 1, 14, 30).getTime();

  igual('data em dd/mm/aaaa', formatarData(quando), '01/09/2026');
  igual('data curta em dd/mm', formatarDataCurta(quando), '01/09');
  igual('data com hora', formatarDataHora(quando), '01/09/2026 às 14:30');
  igual('mes por extenso em portugues', nomeMes('2026-09'), 'setembro de 2026');
  igual('dezembro tambem', nomeMes('2026-12'), 'dezembro de 2026');

  igual('para o input de data', paraInputData(quando), '2026-09-01');
  const lido = deInputData('2026-08-19');
  conferir('o input de data e lido de volta', lido !== null, String(lido));
  igual('e volta no mesmo dia', lido === null ? '' : formatarData(lido), '19/08/2026');
  igual('texto fora do formato nao vira data', deInputData('19/08/2026'), null);
  igual('texto vazio tambem nao', deInputData(''), null);
}

/*
 * ================================================== 17. o razao do mes fecha
 *
 * A secao existe porque `sobra` e `aVencer` eram os DOIS UNICOS campos de
 * `MesFinanceiro` sem nenhuma assercao — e era justamente neles que estava o
 * erro. `sobra` somava `aVencer` (regime de competencia) com `pagamentos`
 * (regime de caixa), e como a presuncao zera `restante` e qualquer pagamento
 * registrado cancela a presuncao, o resultado era perverso: quanto MENOS o
 * usuario contava ao app, melhor o mes passado parecia.
 *
 * Os tres agostos abaixo sao identicos menos pelo que foi registrado. O que a
 * sobra desconta tem de ser o que de fato saiu da conta: 100, 40 e 0.
 */
console.log('\n17. O razao do mes fecha');
{
  const corrente = conta({ apelido: 'Corrente', tipo: 'corrente' });
  const cartao = conta({ apelido: 'Cartao', tipo: 'credito', diaFechamento: 20, diaVencimento: 27 });
  const salario = renda({ data: T(2026, 9, 5), contaId: corrente.id, valor: 300000 });
  const agora = T(2026, 9, 30);

  // Fatura de agosto: compra de R$ 100 no credito, no dia 10.
  const noCredito = compra({ data: T(2026, 8, 10), total: 10000, contaId: cartao.id });
  const base = { contas: [corrente, cartao], compras: [noCredito], rendas: [salario] };

  const quitado = resumoDoMes(
    dados({
      ...base,
      transferencias: [
        transferencia({
          alvo: 'cartao',
          alvoId: cartao.id,
          competencia: '2026-08',
          data: T(2026, 8, 27),
          valor: 10000,
        }),
      ],
    }),
    '2026-08',
    agora,
  );

  const parcial = resumoDoMes(
    dados({
      ...base,
      transferencias: [
        transferencia({
          alvo: 'cartao',
          alvoId: cartao.id,
          competencia: '2026-08',
          data: T(2026, 8, 27),
          valor: 4000,
        }),
      ],
    }),
    '2026-08',
    agora,
  );

  const semRegistro = resumoDoMes(dados(base), '2026-08', agora);

  igual('quem pagou os R$ 100 desconta 100 da sobra', quitado.entradas - quitado.sobra, 10000);
  igual('quem pagou R$ 40 desconta 40, e nao 100', parcial.entradas - parcial.sobra, 4000);
  igual('quem nao registrou nada desconta 0', semRegistro.entradas - semRegistro.sobra, 0);

  // O que sobrou em aberto continua VISIVEL, so nao entra na subtracao.
  igual('o pagamento parcial deixa R$ 60 a vencer', parcial.aVencer, 6000);
  igual('a fatura quitada nao deixa nada a vencer', quitado.aVencer, 0);
  igual('a presumida tambem nao, porque foi dada por paga', semRegistro.aVencer, 0);

  // E a presuncao e MARCADA, para a tela poder dizer de onde veio o numero.
  conferir('o mes presumido vem marcado', semRegistro.presumido, String(semRegistro.presumido));
  conferir('o mes com pagamento parcial NAO e presumido', !parcial.presumido, String(parcial.presumido));
  conferir('o mes quitado tambem nao', !quitado.presumido, String(quitado.presumido));

  // Pagar mais nunca pode deixar a sobra MAIOR: era esse o sintoma do bug.
  conferir(
    'pagar mais desconta mais, sempre',
    quitado.sobra < parcial.sobra && parcial.sobra < semRegistro.sobra,
    `quitado ${quitado.sobra}, parcial ${parcial.sobra}, sem registro ${semRegistro.sobra}`,
  );

  // O desconto em folha sai da conta sem virar Transferencia. Como `entradas` e
  // o salario BRUTO (invariante 17), sem subtrai-lo a sobra saia inflada todo
  // mes — e antes desta correcao ele sumia do resumo, porque a presuncao zerava
  // o `restante` que era o unico caminho dele ate a sobra.
  const consignado = divida({
    valorTotal: 1200000,
    parcelas: 24,
    primeiraEm: T(2026, 1, 10),
    descontoEmFolha: true,
    contaId: corrente.id,
  });
  const comFolha = resumoDoMes(
    dados({ contas: [corrente], rendas: [salario], dividas: [consignado] }),
    '2026-09',
    agora,
  );

  igual('a parcela retida na folha aparece no mes', comFolha.descontoEmFolha, 50000);
  igual('e sai da sobra', comFolha.sobra, 250000);

  // A IDENTIDADE DO RAZAO. Toda linha que a tela desenha esta aqui; se alguem
  // acrescentar um termo a `sobra` sem dar linha a ele no Resumo, isto falha.
  const vale = conta({ apelido: 'Vale', tipo: 'vale' });
  const recarga = renda({ data: T(2026, 9, 5), contaId: vale.id, valor: 35000 });
  const composto = resumoDoMes(
    dados({
      contas: [corrente, cartao, vale],
      compras: [
        compra({ data: T(2026, 9, 3), total: 8000, contaId: corrente.id }),
        compra({ data: T(2026, 9, 4), total: 12000, contaId: cartao.id }),
        compra({ data: T(2026, 9, 5), total: 3000 }),
        compra({ data: T(2026, 9, 6), total: 4000, contaId: vale.id }),
      ],
      rendas: [salario, recarga],
      dividas: [consignado],
      transferencias: [
        transferencia({
          alvo: 'cartao',
          alvoId: cartao.id,
          competencia: '2026-08',
          data: T(2026, 9, 27),
          valor: 5000,
        }),
        transferencia({
          origemContaId: corrente.id,
          alvo: 'conta',
          alvoId: vale.id,
          data: T(2026, 9, 8),
          valor: 2000,
        }),
      ],
    }),
    '2026-09',
    agora,
  );

  const subtracao = composto.entradas - composto.saidasAVista - composto.pagamentos
    - composto.descontoEmFolha - composto.enviadoAoVale;

  igual(
    'sobra = entradas - a vista - pagamentos - desconto em folha - enviado ao vale',
    composto.sobra,
    subtracao,
  );

  conferir(
    'o credito NAO entra na sobra',
    composto.noCredito > 0 && composto.sobra === subtracao,
    `noCredito ${composto.noCredito}`,
  );

  // O vale fica fora dos DOIS lados: a recarga nao e entrada de caixa e a compra
  // feita com ele nao e saida de caixa. So o que sai da corrente para ele conta.
  igual('a recarga do vale nao entra em `entradas`', composto.entradas, 300000);
  igual('ela tem campo proprio', composto.entradasNoVale, 35000);
  igual('a compra no vale nao sai do caixa', composto.noVale, 4000);
  igual('o que a corrente mandou para o vale sai', composto.enviadoAoVale, 2000);

  igual(
    'comprado = a vista + credito + vale + sem conta',
    composto.comprado,
    composto.saidasAVista + composto.noCredito + composto.noVale + composto.semConta,
  );

  igual('compra sem conta fica fora do caixa, mas dentro do comprado', composto.semConta, 3000);
  igual('e o caixa do mes conta so o que saiu de conta', composto.saidasAVista, 8000);
}

/*
 * ================================= 17b. a sobra e a variacao do saldo em conta
 *
 * A identidade da secao 17 confere que a sobra e a soma das SUAS parcelas. Ela
 * nao confere que as parcelas estao certas — e nao estavam. Tres vazamentos, no
 * mesmo numero, passavam por ela:
 *
 *   1. a recarga do vale entrava como receita e a compra no vale nunca saia;
 *   2. o beneficio que cai na corrente e e transferido para o vale nao saia;
 *   3. no mes corrente, o salario contava antes de cair.
 *
 * O teste abaixo compara a sobra com a unica coisa que ela pode ser: o quanto o
 * saldo em conta mudou. As contas nascem zeradas no dia 1o, entao o saldo em
 * conta E a variacao do mes. Os dois jeitos de creditar o vale tem de dar o
 * mesmo numero, porque descrevem o mesmo mes.
 */
console.log('\n17b. A sobra do mes e a variacao do saldo em conta');
{
  const cc = conta({ id: 'cc17', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 10, 1, 0) });
  const va = conta({ id: 'va17', tipo: 'vale', saldoInicial: 0, saldoInicialEm: T(2026, 10, 1, 0) });
  const salario = renda({ data: T(2026, 10, 5, 8), valor: 350000, contaId: cc.id });
  const beneficio = renda({ data: T(2026, 10, 1, 8), valor: 35000 });
  const compras = [
    compra({ data: T(2026, 10, 2), total: 23000, contaId: va.id }),
    compra({ data: T(2026, 10, 3), total: 14750, contaId: cc.id }),
  ];

  // Caminho 1: a recarga e uma entrada que cai direto no vale.
  const direto = dados({
    contas: [cc, va],
    compras,
    rendas: [salario, { ...beneficio, contaId: va.id }],
  });

  // Caminho 2: o beneficio cai na corrente e e transferido para o vale no dia 6.
  const transferido = dados({
    contas: [cc, va],
    compras,
    rendas: [salario, { ...beneficio, contaId: cc.id }],
    transferencias: [
      transferencia({ origemContaId: cc.id, alvo: 'conta', alvoId: va.id, data: T(2026, 10, 6), valor: 35000 }),
    ],
  });

  const antesDoSalario = T(2026, 10, 4, 18);
  const fimDoMes = T(2026, 10, 31, 18);

  for (const [caminho, d] of [['recarga direto no vale', direto], ['beneficio transferido', transferido]] as const) {
    for (const [quando, agora] of [['antes do salario', antesDoSalario], ['no fim do mes', fimDoMes]] as const) {
      igual(
        `${caminho}, ${quando}: sobra = saldo em conta`,
        resumoDoMes(d, '2026-10', agora).sobra,
        calcularCarteira(d, agora).saldoEmConta,
      );
    }
  }

  const mesDireto = resumoDoMes(direto, '2026-10', fimDoMes);
  const mesTransferido = resumoDoMes(transferido, '2026-10', fimDoMes);

  igual('os dois caminhos dao a mesma sobra', mesDireto.sobra, mesTransferido.sobra);
  igual('e ela e o salario menos a compra a vista', mesDireto.sobra, 350000 - 14750);

  igual('direto: so o salario e entrada de caixa', mesDireto.entradas, 350000);
  igual('direto: a recarga aparece como entrada no vale', mesDireto.entradasNoVale, 35000);
  igual('direto: nada foi enviado ao vale', mesDireto.enviadoAoVale, 0);

  igual('transferido: salario e beneficio entram no caixa', mesTransferido.entradas, 385000);
  igual('transferido: e o beneficio sai para o vale', mesTransferido.enviadoAoVale, 35000);
  igual('transferido: nenhuma entrada caiu direto no vale', mesTransferido.entradasNoVale, 0);

  // O teto e `agora`: o que ainda vai cair neste mes nao entrou em conta nenhuma.
  const cedo = resumoDoMes(direto, '2026-10', antesDoSalario);
  igual('no dia 4 o salario do dia 5 ainda nao entrou', cedo.entradas, 0);
  igual('mas a recarga do dia 1o ja caiu no vale', cedo.entradasNoVale, 35000);

  // E transferencia com data depois de `agora` tambem nao saiu ainda.
  igual(
    'no dia 4 a transferencia do dia 6 ainda nao saiu',
    resumoDoMes(transferido, '2026-10', antesDoSalario).enviadoAoVale,
    0,
  );
}

// ============================== 18. emprestimo na lista de compras, mes a mes

/*
 * "Ja foi descontado?" era uma pergunta sem resposta em lugar nenhum: o consignado
 * e presumido pago no dia do salario e a Carteira o esconde. O extrato e uma linha
 * por parcela, com a situacao dita por extenso — e e SO LEITURA: parte dos ciclos
 * que a Carteira ja usa e nunca soma em compra.
 */
console.log('\n18. Emprestimo na lista de compras: a situacao de cada parcela');
{
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 1, 1) });
  const salario = salarios('2026-07', '2026-10', 5, 350000, { contaId: 'cc' });

  const consignado = divida({
    id: 'cons', descricao: 'Consignado', valorTotal: 600000, parcelas: 12,
    primeiraEm: T(2026, 7, 17), descontoEmFolha: true, contaId: 'cc',
  });
  const moto = divida({
    id: 'moto', descricao: 'Moto', valorTotal: 360000, parcelas: 36,
    primeiraEm: T(2026, 8, 10), contaId: 'cc',
  });
  const velha = divida({
    id: 'velha', descricao: 'Antigo', valorTotal: 120000, parcelas: 12,
    primeiraEm: T(2025, 10, 20), contaId: 'cc',
  });
  const pagamentos = [
    transferencia({ origemContaId: 'cc', alvo: 'divida', alvoId: 'moto', competencia: '2026-08', data: T(2026, 8, 12), valor: 10000 }),
    transferencia({ origemContaId: 'cc', alvo: 'divida', alvoId: 'moto', competencia: '2026-09', data: T(2026, 9, 11), valor: 4000 }),
  ];
  const base = dados({
    contas: [cc], rendas: salario, dividas: [consignado, moto, velha], transferencias: pagamentos,
  });

  const achar = (extrato: ReturnType<typeof extratoDeDividas>, dividaId: string, competencia: string) =>
    extrato.find((p) => p.dividaId === dividaId && p.competencia === competencia);

  const dia8 = extratoDeDividas(base, T(2026, 10, 8));
  igual('consignado: o dia do salario ja passou, entao esta descontada', achar(dia8, 'cons', '2026-10')?.situacao, 'descontada');
  igual('e a data da linha e a do desconto', new Date(achar(dia8, 'cons', '2026-10')!.quando).getDate(), 5);
  igual('as de meses passados tambem', achar(dia8, 'cons', '2026-08')?.situacao, 'descontada');
  igual('a linha sabe qual parcela e', `${achar(dia8, 'cons', '2026-10')!.indice}/${achar(dia8, 'cons', '2026-10')!.de}`, '4/12');

  const dia3 = extratoDeDividas(base, T(2026, 10, 3));
  igual('antes do dia do salario, ainda vai ser descontada', achar(dia3, 'cons', '2026-10')?.situacao, 'a_descontar');
  igual('e a de setembro ja foi', achar(dia3, 'cons', '2026-09')?.situacao, 'descontada');

  igual('paga por registro: paga', achar(dia8, 'moto', '2026-08')?.situacao, 'paga');
  igual('e a data da linha e a do pagamento', new Date(achar(dia8, 'moto', '2026-08')!.quando).getDate(), 12);
  igual('pagamento menor que a parcela: parcial', achar(dia8, 'moto', '2026-09')?.situacao, 'parcial');
  igual('e diz quanto falta', achar(dia8, 'moto', '2026-09')?.restante, 6000);
  igual('sem pagamento e antes do vencimento: a vencer', achar(dia8, 'moto', '2026-10')?.situacao, 'a_vencer');
  igual(
    'vencimento do mes passado e sem pagamento: em aberto',
    achar(extratoDeDividas(base, T(2026, 10, 15)), 'moto', '2026-10')?.situacao,
    'em_aberto',
  );
  igual('competencia passada sem registro nenhum: presumida', achar(dia8, 'velha', '2026-08')?.situacao, 'presumida');

  conferir('nao ha parcela futura', dia8.every((p) => p.competencia <= '2026-10'));
  igual('o consignado nao tem linha de novembro', achar(dia8, 'cons', '2026-11'), undefined);
  conferir(
    'do mais recente para o mais antigo',
    dia8.every((p, i) => i === 0 || dia8[i - 1]!.quando >= p.quando),
  );

  const semConsignado = extratoDeDividas(dados({ ...base, dividas: [{ ...consignado, excluidoEm: 1 }, moto] }), T(2026, 10, 8));
  igual('divida excluida nao aparece', semConsignado.filter((p) => p.dividaId === 'cons').length, 0);

  const contagem = parcelasQuitadasDaCompetencia(dia8, '2026-10');
  igual('em outubro ha 2 parcelas', contagem.total, 2);
  igual('e so a do consignado esta quitada', contagem.quitadas, 1);

  // NADA SOMA EM COMPRA: o extrato e leitura, e o que e gasto continua o mesmo.
  const compras = [compra({ data: T(2026, 10, 3), total: 12345, contaId: 'cc' })];
  const comDividas = resumoDoMes(dados({ ...base, compras }), '2026-10', T(2026, 10, 8));
  const semDividas = resumoDoMes(dados({ contas: [cc], rendas: salario, compras }), '2026-10', T(2026, 10, 8));
  igual('o total comprado nao muda com os emprestimos', comDividas.comprado, semDividas.comprado);
}

// ===================================== 18b. os meses que uma lista oferece

console.log('\n18b. Lista por mes: os meses com algo, e sempre o corrente');
{
  const agora = T(2026, 10, 8);
  igual(
    'meses com movimento, do mais recente ao mais antigo',
    mesesDaLista(['2026-08', '2026-10', '2026-06'], agora).join(','),
    '2026-10,2026-08,2026-06',
  );
  igual(
    'o corrente entra mesmo vazio',
    mesesDaLista(['2026-08'], agora).join(','),
    '2026-10,2026-08',
  );
  igual('sem nada, so o corrente', mesesDaLista([], agora).join(','), '2026-10');
  igual(
    'nao repete o mes',
    mesesDaLista(['2026-10', '2026-10', '2026-09'], agora).join(','),
    '2026-10,2026-09',
  );
  igual(
    'mes futuro com lancamento tambem aparece',
    mesesDaLista(['2026-12'], agora).join(','),
    '2026-12,2026-10',
  );
}

// ================================ 19. parcela variavel: o que paguei vira o valor

/*
 * O financiamento da casa nao cobra o mesmo valor todo mes. Com o interruptor
 * ligado, o que foi PAGO define a parcela daquele mes e vira a referencia das
 * seguintes — sem reescrever os meses de antes, e sem guardar nada por mes.
 */
console.log('\n19. Parcela variavel: o que eu paguei vira o valor da parcela');
{
  const AGORA = T(2026, 10, 8);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: T(2026, 1, 1) });
  const casa = divida({
    id: 'casa', descricao: 'Casa', tipo: 'financiamento', valorTotal: 36000000, parcelas: 360,
    primeiraEm: T(2026, 7, 10), contaId: 'cc', parcelaVariavel: true,
  });
  const pagar = (competencia: string, valor: number, dia = 10, mes = Number(competencia.slice(5))) =>
    transferencia({
      origemContaId: 'cc', alvo: 'divida', alvoId: 'casa', competencia, valor,
      data: T(2026, mes, dia),
    });
  const valorDe = (d: ReturnType<typeof divida>, pagamentos: ReturnType<typeof pagar>[], competencia: string) =>
    parcelasDaDivida(d, pagamentos).find((p) => p.competencia === competencia)?.valor;

  const pagamentos = [pagar('2026-08', 135000), pagar('2026-09', 137210)];

  igual('o mes pago vale o que foi pago (agosto)', valorDe(casa, pagamentos, '2026-08'), 135000);
  igual('o mes pago vale o que foi pago (setembro)', valorDe(casa, pagamentos, '2026-09'), 137210);
  igual('outubro em diante vale o ultimo pago', valorDe(casa, pagamentos, '2026-10'), 137210);
  igual('e vale por todo o resto do prazo', valorDe(casa, pagamentos, '2029-06'), 137210);
  igual('antes do primeiro pagamento, o calculado de sempre', valorDe(casa, pagamentos, '2026-07'), 100000);

  const ciclos = porCompetencia(parcelasDaDivida(casa, pagamentos), pagamentos, '2026-09');
  const setembro = ciclos.find((c) => c.competencia === '2026-09')!;
  igual('o mes pago fica quitado: nao e pagamento parcial', setembro.restante, 0);
  igual('pagar menos que o calculado tambem quita o mes', ciclos.find((c) => c.competencia === '2026-08')!.restante, 0);

  const base = dados({ contas: [cc], dividas: [casa], transferencias: pagamentos });
  const comp = compromissos(base, AGORA).find((c) => c.id === 'casa')!;
  igual('falta pagar: as parcelas restantes a referencia', comp.falta.restante, (360 - 3) * 137210);
  igual(
    'a previsao do mes seguinte usa a referencia',
    projetar(base, { meses: 3, agora: AGORA }).find((l) => l.mes === '2026-11')?.comprometido,
    137210,
  );

  // Desfazer o ultimo pagamento devolve a referencia ao anterior.
  igual(
    'sem o pagamento de setembro, a referencia volta a ser a de agosto',
    valorDe(casa, [pagamentos[0]!], '2026-10'),
    135000,
  );

  // Buraco entre pagamentos: o mes sem registro mantem o valor calculado.
  const comBuraco = [pagar('2026-07', 120000, 10, 7), pagar('2026-09', 137210)];
  igual('o buraco entre dois pagamentos mantem o calculado', valorDe(casa, comBuraco, '2026-08'), 100000);
  igual('e o mes depois do ultimo usa a referencia', valorDe(casa, comBuraco, '2026-10'), 137210);

  // Dois pagamentos na mesma competencia somam.
  const dois = [pagar('2026-09', 100000, 5), pagar('2026-09', 37210, 15)];
  igual('dois pagamentos na mesma competencia somam', valorDe(casa, dois, '2026-09'), 137210);
  igual('e a referencia e a soma', valorDe(casa, dois, '2026-10'), 137210);

  igual('sem nenhum pagamento, tudo como sempre', valorDe(casa, [], '2026-10'), 100000);

  // SEM O INTERRUPTOR NADA MUDA: pagar diferente continua sendo pagamento parcial.
  const comum = { ...casa, parcelaVariavel: false };
  igual('sem o interruptor, o valor nao segue o pagamento', valorDe(comum, pagamentos, '2026-10'), 100000);
  const ciclosComum = porCompetencia(parcelasDaDivida(comum, [pagar('2026-09', 4000)]), [pagar('2026-09', 4000)], '2026-08');
  igual('e pagar menos continua deixando o resto devendo', ciclosComum.find((c) => c.competencia === '2026-09')!.restante, 96000);

  // O extrato (a lista de compras) mostra o valor real da parcela.
  const extrato = extratoDeDividas(base, AGORA);
  igual('o extrato mostra o valor pago em setembro', extrato.find((p) => p.competencia === '2026-09')?.valor, 137210);
  igual('e o de outubro, a referencia', extrato.find((p) => p.competencia === '2026-10')?.valor, 137210);
}

console.log('');if (falhas > 0) {
  console.log(falhas + ' verificacao(oes) falharam.');
  process.exit(1);
}
console.log('Contas: todas as verificacoes passaram.');
process.exit(0);
