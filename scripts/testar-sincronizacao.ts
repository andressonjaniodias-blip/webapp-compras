/**
 * Teste de ponta a ponta da sincronizacao, contra um Postgres de verdade
 * rodando em memoria.
 *
 * Existe porque a sincronizacao e a unica parte do projeto cujos erros sao
 * silenciosos: ela nao quebra a tela, nao levanta excecao e nao aparece no
 * build — o sintoma e "uma compra sumiu", semanas depois, sem pista. Um teste
 * automatizado e a unica forma de saber que a regra de conflito e o cursor
 * fazem o que dizem.
 *
 * Roda com: npm run teste:sync
 */

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

import { readFile } from 'node:fs/promises';
import {
  banco,
  comandosDoEsquema,
  ehEsquemaDesatualizado,
  esquecerEsquemaAplicado,
} from '../servidor/banco';
import { sincronizar } from '../servidor/sincronizacao';
import type {
  Compra,
  Conta,
  Divida,
  EnvioSincronizacao,
  Item,
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

function compraExemplo(id: string, atualizadoEm: number, total: number): Compra {
  return {
    id,
    data: Date.UTC(2026, 7, 3, 12, 0),
    descricao: 'Supermercado do bairro',
    categoria: 'Mercado',
    formaPagamento: 'Débito',
    observacao: '',
    totalManual: 0,
    total,
    qtdItens: 1,
    contaId: null,
    parcelas: 1,
    atualizadoEm,
    excluidoEm: null,
  };
}

function itemExemplo(id: string, compraId: string, atualizadoEm: number): Item {
  return {
    id,
    compraId,
    nome: 'Alcatra',
    quantidade: 1.235,
    unidade: 'kg',
    precoUnitario: 1499,
    // O total do cupom, que NAO e 1,235 x 1499 = 1851.
    total: 1852,
    ordem: 0,
    atualizadoEm,
    excluidoEm: null,
  };
}

function contaExemplo(id: string, atualizadoEm: number, apelido = 'Nubank 4417'): Conta {
  return {
    id,
    apelido,
    tipo: 'credito',
    diaFechamento: 20,
    diaVencimento: 27,
    limite: 500000,
    saldoInicial: 0,
    saldoInicialEm: 0,
    ordem: 0,
    atualizadoEm,
    excluidoEm: null,
  };
}

function rendaExemplo(id: string, atualizadoEm: number, valor = 300000): Renda {
  return {
    id,
    data: Date.UTC(2026, 0, 5, 12, 0),
    descricao: 'Salário',
    origem: 'Salário',
    valor,
    periodicidade: 'mensal',
    encerradoEm: null,
    contaId: null,
    atualizadoEm,
    excluidoEm: null,
  };
}

function dividaExemplo(id: string, atualizadoEm: number): Divida {
  return {
    id,
    descricao: 'Financiamento da moto',
    tipo: 'financiamento',
    valorTotal: 1200000,
    parcelas: 36,
    primeiraEm: Date.UTC(2026, 6, 10, 12, 0),
    descontoEmFolha: false,
    contaId: null,
    observacao: '',
    atualizadoEm,
    excluidoEm: null,
  };
}

function metaExemplo(id: string, atualizadoEm: number): Meta {
  return {
    id,
    descricao: 'Moto',
    valorAlvo: 1500000,
    guardado: 200000,
    reservaMensal: 40000,
    prazoEm: null,
    ordem: 0,
    atualizadoEm,
    excluidoEm: null,
  };
}

function transferenciaExemplo(id: string, atualizadoEm: number, valor = 18520): Transferencia {
  return {
    id,
    origemContaId: 'conta-corrente',
    alvo: 'cartao',
    alvoId: 'conta-1',
    competencia: '2026-09',
    data: Date.UTC(2026, 8, 27, 12, 0),
    valor,
    observacao: '',
    atualizadoEm,
    excluidoEm: null,
  };
}

function regraExemplo(id: string, atualizadoEm: number): RegraCategoria {
  return {
    id,
    termo: 'posto',
    categoria: 'Combustível',
    ordem: 0,
    atualizadoEm,
    excluidoEm: null,
  };
}

const vazio = (cursor: number): EnvioSincronizacao => ({ cursor, compras: [], itens: [] });

async function principal(): Promise<void> {
  const consultar = await banco();
  const esquema = await readFile('esquema.sql', 'utf8');
  for (const comando of comandosDoEsquema(esquema)) await consultar(comando);

  const T0 = Date.UTC(2026, 7, 3, 12, 0);

  console.log('\n1. Aparelho A envia uma compra com um item');
  const a1 = await sincronizar({
    cursor: 0,
    compras: [compraExemplo('compra-1', T0, 1852)],
    itens: [itemExemplo('item-1', 'compra-1', T0)],
  });
  conferir('a compra volta na resposta', a1.compras.length === 1);
  conferir('o item volta na resposta', a1.itens.length === 1);
  conferir('o cursor saiu do zero', a1.cursor > 0, 'cursor=' + a1.cursor);
  conferir(
    'o total do item e o do cupom (1852), nao a multiplicacao (1851)',
    a1.itens[0]?.total === 1852,
    String(a1.itens[0]?.total),
  );
  conferir('a quantidade decimal sobreviveu', a1.itens[0]?.quantidade === 1.235);
  conferir('excluidoEm voltou como null, nao string', a1.compras[0]?.excluidoEm === null);
  conferir(
    'atualizadoEm voltou como numero, nao string',
    typeof a1.compras[0]?.atualizadoEm === 'number',
    typeof a1.compras[0]?.atualizadoEm,
  );
  conferir('as listas novas voltaram vazias, e nao ausentes', Array.isArray(a1.contas));

  console.log('\n2. Aparelho B, do zero, recebe tudo');
  const b1 = await sincronizar(vazio(0));
  conferir('B recebeu a compra', b1.compras.length === 1);
  conferir('B recebeu o item', b1.itens.length === 1);
  conferir('B chegou no mesmo cursor', b1.cursor === a1.cursor);

  console.log('\n3. Aparelho B edita a compra (carimbo mais novo) e envia');
  const b2 = await sincronizar({
    cursor: b1.cursor,
    compras: [{ ...compraExemplo('compra-1', T0 + 60_000, 9999), descricao: 'Editado no B' }],
    itens: [],
  });
  conferir('a edicao de B venceu', b2.compras[0]?.total === 9999);
  conferir('o cursor avancou', b2.cursor > b1.cursor);

  console.log('\n4. Aparelho A envia uma edicao ANTIGA da mesma compra');
  const a2 = await sincronizar({
    cursor: a1.cursor,
    compras: [{ ...compraExemplo('compra-1', T0 - 60_000, 111), descricao: 'Editado no A, atrasado' }],
    itens: [],
  });
  conferir('o servidor ignorou a edicao atrasada', a2.compras[0]?.total === 9999, String(a2.compras[0]?.total));
  conferir('e devolveu a versao vencedora para A', a2.compras[0]?.descricao === 'Editado no B');

  console.log('\n5. Cursor nao devolve o que o aparelho ja tem');
  const a3 = await sincronizar(vazio(a2.cursor));
  conferir('nada novo veio', a3.compras.length === 0 && a3.itens.length === 0);
  conferir('o cursor ficou parado', a3.cursor === a2.cursor);

  console.log('\n6. Exclusao logica se propaga');
  const agora = T0 + 120_000;
  const a4 = await sincronizar({
    cursor: a3.cursor,
    compras: [{ ...compraExemplo('compra-1', agora, 9999), excluidoEm: agora }],
    itens: [{ ...itemExemplo('item-1', 'compra-1', agora), excluidoEm: agora }],
  });
  conferir('a lapide foi gravada', a4.compras[0]?.excluidoEm === agora, String(a4.compras[0]?.excluidoEm));

  const b3 = await sincronizar(vazio(b2.cursor));
  conferir('B recebeu a exclusao', b3.compras[0]?.excluidoEm === agora);

  console.log('\n7. Item pode chegar antes da compra dele (sem chave estrangeira)');
  const orfao = await sincronizar({
    cursor: a4.cursor,
    compras: [],
    itens: [itemExemplo('item-2', 'compra-que-ainda-nao-existe', T0 + 200_000)],
  });
  conferir('o lote nao foi rejeitado', orfao.itens.length === 1);

  console.log('\n8. O mesmo id repetido no lote nao derruba o comando');
  const repetido = await sincronizar({
    cursor: orfao.cursor,
    compras: [compraExemplo('compra-2', T0 + 300_000, 100), compraExemplo('compra-2', T0 + 400_000, 200)],
    itens: [],
  });
  const compra2 = repetido.compras.find((c) => c.id === 'compra-2');
  conferir('ficou a versao mais recente do lote', compra2?.total === 200, String(compra2?.total));

  console.log('\n9. As seis tabelas novas fazem a viagem de ida e volta');
  const T1 = T0 + 500_000;
  const novas = await sincronizar({
    cursor: repetido.cursor,
    compras: [],
    itens: [],
    contas: [contaExemplo('conta-1', T1)],
    rendas: [rendaExemplo('renda-1', T1)],
    dividas: [dividaExemplo('divida-1', T1)],
    metas: [metaExemplo('meta-1', T1)],
    transferencias: [transferenciaExemplo('transf-1', T1)],
    regras: [regraExemplo('regra-1', T1)],
  });
  conferir('a conta voltou', novas.contas[0]?.apelido === 'Nubank 4417');
  conferir('o dia de fechamento sobreviveu', novas.contas[0]?.diaFechamento === 20);
  conferir('o limite voltou como numero', novas.contas[0]?.limite === 500000);
  conferir('a renda voltou', novas.rendas[0]?.valor === 300000);
  conferir('a periodicidade sobreviveu', novas.rendas[0]?.periodicidade === 'mensal');
  conferir('encerradoEm voltou como null', novas.rendas[0]?.encerradoEm === null);
  conferir('a divida voltou', novas.dividas[0]?.parcelas === 36);
  conferir('a meta voltou', novas.metas[0]?.valorAlvo === 1500000);
  conferir('prazoEm voltou como null', novas.metas[0]?.prazoEm === null);
  conferir('a transferencia voltou', novas.transferencias[0]?.valor === 18520);
  conferir('o alvo da transferencia sobreviveu', novas.transferencias[0]?.alvoId === 'conta-1');
  conferir('a competencia sobreviveu', novas.transferencias[0]?.competencia === '2026-09');
  conferir('a regra voltou', novas.regras[0]?.categoria === 'Combustível');

  console.log('\n10. Conflito e lapide valem nas tabelas novas tambem');
  const conflito = await sincronizar({
    cursor: novas.cursor,
    compras: [],
    itens: [],
    // Carimbo mais ANTIGO: tem que perder.
    contas: [contaExemplo('conta-1', T1 - 60_000, 'Nome atrasado')],
    rendas: [rendaExemplo('renda-1', T1 + 60_000, 340000)],
  });
  // Quando a edicao atrasada e ignorada, a versao NAO muda — entao o registro
  // nem aparece na resposta do cursor. Conferir no estado, com um pull do zero,
  // e a unica forma de distinguir "foi ignorada" de "nao voltou por acaso".
  const estado = await sincronizar(vazio(0));
  conferir(
    'a edicao atrasada da conta foi ignorada',
    estado.contas.find((c) => c.id === 'conta-1')?.apelido === 'Nubank 4417',
    estado.contas.find((c) => c.id === 'conta-1')?.apelido,
  );
  conferir(
    'e ela nao voltou como novidade no cursor',
    conflito.contas.every((c) => c.id !== 'conta-1'),
  );
  conferir(
    'o aumento de renda com carimbo novo venceu',
    conflito.rendas.find((r) => r.id === 'renda-1')?.valor === 340000,
  );

  const T2 = T1 + 120_000;
  const lapide = await sincronizar({
    cursor: conflito.cursor,
    compras: [],
    itens: [],
    metas: [{ ...metaExemplo('meta-1', T2), excluidoEm: T2 }],
  });
  conferir('a lapide da meta foi gravada', lapide.metas[0]?.excluidoEm === T2);

  console.log('\n11. A compra carrega conta e parcelas ate o banco e de volta');
  const T3 = T2 + 60_000;
  const parcelada = await sincronizar({
    cursor: lapide.cursor,
    compras: [
      {
        ...compraExemplo('compra-3', T3, 120000),
        contaId: 'conta-1',
        parcelas: 12,
        descricao: 'Geladeira',
      },
    ],
    itens: [],
  });
  const geladeira = parcelada.compras.find((c) => c.id === 'compra-3');
  conferir('contaId sobreviveu', geladeira?.contaId === 'conta-1', String(geladeira?.contaId));
  conferir('parcelas sobreviveu', geladeira?.parcelas === 12, String(geladeira?.parcelas));

  console.log('\n12. Aparelho antigo, que so conhece compras e itens, continua funcionando');
  const antigo = await sincronizar({
    cursor: 0,
    compras: [compraExemplo('compra-4', T3 + 60_000, 500)],
    itens: [],
  } as EnvioSincronizacao);
  conferir('o lote foi aceito sem as listas novas', antigo.compras.length > 0);
  conferir('e o servidor devolveu as tabelas novas mesmo assim', antigo.contas.length === 1);

  console.log('\n13. Um aparelho novo, do zero, recebe as oito tabelas');
  const zerado = await sincronizar(vazio(0));
  conferir('recebeu contas', zerado.contas.length === 1);
  conferir('recebeu rendas', zerado.rendas.length === 1);
  conferir('recebeu dividas', zerado.dividas.length === 1);
  conferir('recebeu metas (inclusive a que esta na lapide)', zerado.metas.length === 1);
  conferir('recebeu transferencias', zerado.transferencias.length === 1);
  conferir('recebeu regras', zerado.regras.length === 1);
  conferir(
    'o cursor cobre a maior versao de todas as tabelas',
    zerado.cursor === parcelada.cursor || zerado.cursor >= antigo.cursor,
    'cursor=' + zerado.cursor,
  );

  await testarAutocuraDoEsquema(consultar);

  console.log('');
  if (falhas > 0) {
    console.log(falhas + ' verificacao(oes) falharam.');
    process.exit(1);
  }
  console.log('Sincronizacao: todas as verificacoes passaram.');
  process.exit(0);
}

/**
 * O caso que aconteceu de verdade em producao, em 31/08/2026.
 *
 * Publicar a v2 sem rodar `npm run banco:criar` deixou o Neon com apenas
 * `compras` e `itens`, e sem as colunas novas. Resultado: TODA sincronizacao
 * respondia 500 — o app continuava funcionando no aparelho e nada subia para a
 * nuvem, que e o pior jeito de falhar neste projeto.
 *
 * Aqui o banco antigo e reconstruido do zero para provar que a autocura pega o
 * caso: sem tabela nova, sem coluna nova, e com uma compra ja gravada que nao
 * pode se perder no caminho.
 */
async function testarAutocuraDoEsquema(consultar: Awaited<ReturnType<typeof banco>>): Promise<void> {
  console.log('\n14. O banco atrasado se cura sozinho (o incidente de producao)');

  const tabelasNovas = ['contas', 'rendas', 'dividas', 'metas', 'transferencias', 'regras'];
  for (const tabela of tabelasNovas) await consultar('DROP TABLE IF EXISTS ' + tabela);
  await consultar('DROP TABLE IF EXISTS compras');
  await consultar('DROP TABLE IF EXISTS itens');

  // Exatamente o esquema da v1: sem conta_id, sem parcelas, sem tabela nova.
  await consultar(`CREATE TABLE compras (
    id TEXT PRIMARY KEY, data BIGINT NOT NULL, descricao TEXT NOT NULL DEFAULT '',
    categoria TEXT NOT NULL DEFAULT '', forma_pagamento TEXT NOT NULL DEFAULT '',
    observacao TEXT NOT NULL DEFAULT '', total_manual BIGINT NOT NULL DEFAULT 0,
    total BIGINT NOT NULL DEFAULT 0, qtd_itens INTEGER NOT NULL DEFAULT 0,
    atualizado_em BIGINT NOT NULL, excluido_em BIGINT, versao BIGINT NOT NULL)`);
  await consultar(`CREATE TABLE itens (
    id TEXT PRIMARY KEY, compra_id TEXT NOT NULL, nome TEXT NOT NULL DEFAULT '',
    quantidade DOUBLE PRECISION NOT NULL DEFAULT 0, unidade TEXT NOT NULL DEFAULT 'un',
    preco_unitario BIGINT NOT NULL DEFAULT 0, total BIGINT NOT NULL DEFAULT 0,
    ordem INTEGER NOT NULL DEFAULT 0, atualizado_em BIGINT NOT NULL,
    excluido_em BIGINT, versao BIGINT NOT NULL)`);

  await consultar(
    `INSERT INTO compras (id, data, descricao, categoria, forma_pagamento, observacao,
       total_manual, total, qtd_itens, atualizado_em, excluido_em, versao)
     VALUES ('compra-da-v1', $1, 'Mercado de antes', 'Mercado', 'Débito', '', 4500, 4500, 0, $1, NULL, nextval('seq_versao'))`,
    [Date.UTC(2026, 6, 1, 12, 0)],
  );

  esquecerEsquemaAplicado();

  let curou = true;
  let detalhe = '';
  let resposta;
  try {
    resposta = await sincronizar(vazio(0));
  } catch (falha) {
    curou = false;
    detalhe = falha instanceof Error ? falha.message : String(falha);
  }

  conferir('a sincronizacao nao morre com o banco atrasado', curou, detalhe);
  if (!resposta) return;

  conferir('as oito listas voltaram', Array.isArray(resposta.contas) && Array.isArray(resposta.regras));
  conferir('a compra da v1 sobreviveu', resposta.compras.some((c) => c.id === 'compra-da-v1'));
  conferir(
    'e ganhou o padrao das colunas novas',
    resposta.compras.find((c) => c.id === 'compra-da-v1')?.parcelas === 1,
    String(resposta.compras.find((c) => c.id === 'compra-da-v1')?.parcelas),
  );
  conferir(
    'contaId veio nulo, nao undefined',
    resposta.compras.find((c) => c.id === 'compra-da-v1')?.contaId === null,
  );

  const criadas = await consultar<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const nomes = new Set(criadas.map((linha) => linha.table_name));
  conferir(
    'as seis tabelas novas passaram a existir',
    tabelasNovas.every((t) => nomes.has(t)),
    [...nomes].join(', '),
  );

  // Gravar nas tabelas recem-criadas tem que funcionar na mesma rodada seguinte.
  const depois = await sincronizar({
    cursor: resposta.cursor,
    compras: [],
    itens: [],
    contas: [contaExemplo('conta-pos-cura', Date.now())],
  });
  conferir('e ja da para gravar nelas', depois.contas.some((c) => c.id === 'conta-pos-cura'));

  // A outra metade da regra, e a que importa mais: a autocura NAO pode engolir
  // erro que nao seja esquema atrasado. Trocar um problema visivel por um
  // silencioso seria pior que o problema original.
  conferir('reconhece tabela ausente', ehEsquemaDesatualizado({ code: '42P01' }));
  conferir('reconhece coluna ausente', ehEsquemaDesatualizado({ code: '42703' }));
  conferir('NAO reage a erro de sintaxe', !ehEsquemaDesatualizado({ code: '42601' }));
  conferir('NAO reage a violacao de restricao', !ehEsquemaDesatualizado({ code: '23505' }));
  conferir('NAO reage a falha de conexao', !ehEsquemaDesatualizado(new Error('ECONNREFUSED')));
  conferir('NAO reage a nulo', !ehEsquemaDesatualizado(null));
}

principal().catch((falha: unknown) => {
  console.error(falha);
  process.exit(1);
});
