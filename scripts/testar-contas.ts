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
  faturasDoCartao,
  ocorrenciasDeRenda,
  resumoDoMes,
  saldoDaConta,
  type DadosFinanceiros,
} from '../compartilhado/carteira';
import {
  chaveDoMes,
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
  estimarGastoCorrente,
  planejarMeta,
  projetar,
  simular,
} from '../compartilhado/previsao';
import { limitesDo } from '../compartilhado/planos';
import {
  adivinharCategoria,
  deveAplicarSozinho,
  resumirHistorico,
  type UsoDaDescricao,
} from '../compartilhado/categorizacao';
import { casaTermo, fatorDeRecencia, ordenarSugestoes } from '../compartilhado/sugestoes';
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
    periodicidade: parcial.periodicidade ?? 'mensal',
    encerradoEm: parcial.encerradoEm ?? null,
    contaId: parcial.contaId ?? null,
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

// ===================================================== 7. renda que muda

console.log('\n7. Aumento de salario, sem buraco e sem mes dobrado');
{
  const antiga = renda({ data: T(2026, 1, 5), valor: 300000, encerradoEm: T(2026, 6, 30, 23) });
  const nova = renda({ data: T(2026, 7, 1), valor: 340000, encerradoEm: null });

  const junho = ocorrenciasDeRenda(antiga, T(2026, 12, 31)).filter(
    (ms) => chaveDoMes(ms) === '2026-06',
  );
  const julhoAntiga = ocorrenciasDeRenda(antiga, T(2026, 12, 31)).filter(
    (ms) => chaveDoMes(ms) === '2026-07',
  );
  const julhoNova = ocorrenciasDeRenda(nova, T(2026, 12, 31)).filter(
    (ms) => chaveDoMes(ms) === '2026-07',
  );

  igual('junho tem uma ocorrencia da renda antiga', junho.length, 1);
  igual('a antiga nao alcanca julho', julhoAntiga.length, 0);
  igual('e a nova cobre julho', julhoNova.length, 1);

  const base = dados({ rendas: [antiga, nova] });
  const seisMeses = ['2026-05', '2026-06', '2026-07', '2026-08'].map(
    (mes) => resumoDoMes(base, mes, T(2026, 12, 31)).entradas,
  );
  igual('maio ainda vale 3000', seisMeses[0], 300000);
  igual('junho ainda vale 3000', seisMeses[1], 300000);
  igual('julho ja vale 3400 — uma vez so', seisMeses[2], 340000);
  igual('agosto vale 3400', seisMeses[3], 340000);

  let anoTodo = 0;
  for (let m = 1; m <= 12; m += 1) {
    anoTodo += resumoDoMes(base, `2026-${String(m).padStart(2, '0')}`, T(2026, 12, 31)).entradas;
  }
  igual('o ano soma 6 x 3000 + 6 x 3400, sem duplicar', anoTodo, 6 * 300000 + 6 * 340000);

  const decimo = renda({ data: T(2026, 12, 20), valor: 300000, periodicidade: 'anual' });
  const comDecimo = dados({ rendas: [decimo] });
  igual('o 13o cai em dezembro', resumoDoMes(comDecimo, '2026-12', T(2027, 12, 31)).entradas, 300000);
  igual('e nao cai em novembro', resumoDoMes(comDecimo, '2026-11', T(2027, 12, 31)).entradas, 0);
  igual('cai de novo no dezembro seguinte', resumoDoMes(comDecimo, '2027-12', T(2028, 1, 5)).entradas, 300000);

  const unica = renda({ data: T(2026, 3, 10), valor: 50000, periodicidade: 'unica' });
  igual('renda unica cai uma vez so', ocorrenciasDeRenda(unica, T(2027, 12, 31)).length, 1);
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
  const salario = renda({ data: T(2026, 1, 5), valor: 300000, periodicidade: 'mensal' });

  const base = dados({ contas: [cc, cartao], rendas: [salario] });
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

// ==================================================== 11. simulador

console.log('\n11. O simulador');
{
  const agora = T(2026, 9, 1, 0);
  const cc = conta({ id: 'cc', tipo: 'corrente', saldoInicial: 100000, saldoInicialEm: T(2026, 8, 31) });
  const cartao = conta({ id: 'cartao', tipo: 'credito', diaFechamento: 20, diaVencimento: 27, limite: 500000 });
  const salario = renda({ data: T(2026, 1, 5), valor: 300000, periodicidade: 'mensal' });
  const base = dados({ contas: [cc, cartao], rendas: [salario] });
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
    rendas: [renda({ data: T(2026, 1, 5), valor: 300000 })],
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

console.log('');
if (falhas > 0) {
  console.log(falhas + ' verificacao(oes) falharam.');
  process.exit(1);
}
console.log('Contas: todas as verificacoes passaram.');
process.exit(0);
