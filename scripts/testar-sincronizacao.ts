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
import { banco } from '../servidor/banco';
import { sincronizar } from '../servidor/sincronizacao';
import type { Compra, EnvioSincronizacao, Item } from '../compartilhado/tipos';

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

const vazio = (cursor: number): EnvioSincronizacao => ({ cursor, compras: [], itens: [] });

async function principal(): Promise<void> {
  const consultar = await banco();
  const esquema = await readFile('esquema.sql', 'utf8');
  for (const comando of esquema.split(';')) {
    if (comando.trim()) await consultar(comando);
  }

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

  console.log('');
  if (falhas > 0) {
    console.log(falhas + ' verificacao(oes) falharam.');
    process.exit(1);
  }
  console.log('Sincronizacao: todas as verificacoes passaram.');
  process.exit(0);
}

principal().catch((falha: unknown) => {
  console.error(falha);
  process.exit(1);
});
