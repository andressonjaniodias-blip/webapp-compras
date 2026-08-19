/**
 * O lado servidor da sincronizacao: recebe o que mudou no aparelho, decide
 * quem vence os conflitos e devolve tudo que mudou desde o cursor.
 *
 * A regra de conflito e uma linha de SQL: `WHERE atualizado_em <= EXCLUDED...`
 * no ON CONFLICT. Quem tem o carimbo mais novo sobrescreve; quem chegou
 * atrasado e simplesmente ignorado, e o pull devolve ao aparelho a versao que
 * venceu. Resolver no banco, e nao em JavaScript, evita a janela em que duas
 * requisicoes lidas ao mesmo tempo se sobrescreveriam.
 *
 * Os lotes viajam como UM parametro jsonb e sao expandidos por
 * `jsonb_to_recordset`. A alternativa — um INSERT por registro — custaria uma
 * ida e volta HTTP por item, e uma compra de supermercado tem trinta.
 */

import type {
  Compra,
  ComVersao,
  EnvioSincronizacao,
  Item,
  RespostaSincronizacao,
} from '../compartilhado/tipos';
import { banco, numero, numeroOuNulo } from './banco';

/**
 * Teto por rodada. Nao e paginacao de verdade: serve para uma restauracao de
 * backup grande nao virar uma resposta de dezenas de MB. Quando corta, o cursor
 * so avanca ate onde as duas tabelas estao completas, e a rodada seguinte pega
 * o resto.
 */
const LIMITE = 2000;

const UPSERT_COMPRAS = `
INSERT INTO compras (id, data, descricao, categoria, forma_pagamento, observacao,
                     total_manual, total, qtd_itens, atualizado_em, excluido_em, versao)
SELECT t.id, t.data, t.descricao, t.categoria, t.forma_pagamento, t.observacao,
       t.total_manual, t.total, t.qtd_itens, t.atualizado_em, t.excluido_em,
       nextval('seq_versao')
FROM jsonb_to_recordset($1::jsonb) AS t(
  id text, data bigint, descricao text, categoria text, forma_pagamento text,
  observacao text, total_manual bigint, total bigint, qtd_itens int,
  atualizado_em bigint, excluido_em bigint
)
ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  forma_pagamento = EXCLUDED.forma_pagamento,
  observacao = EXCLUDED.observacao,
  total_manual = EXCLUDED.total_manual,
  total = EXCLUDED.total,
  qtd_itens = EXCLUDED.qtd_itens,
  atualizado_em = EXCLUDED.atualizado_em,
  excluido_em = EXCLUDED.excluido_em,
  versao = nextval('seq_versao')
WHERE compras.atualizado_em <= EXCLUDED.atualizado_em
`;

const UPSERT_ITENS = `
INSERT INTO itens (id, compra_id, nome, quantidade, unidade, preco_unitario,
                   total, ordem, atualizado_em, excluido_em, versao)
SELECT t.id, t.compra_id, t.nome, t.quantidade, t.unidade, t.preco_unitario,
       t.total, t.ordem, t.atualizado_em, t.excluido_em,
       nextval('seq_versao')
FROM jsonb_to_recordset($1::jsonb) AS t(
  id text, compra_id text, nome text, quantidade double precision, unidade text,
  preco_unitario bigint, total bigint, ordem int, atualizado_em bigint,
  excluido_em bigint
)
ON CONFLICT (id) DO UPDATE SET
  compra_id = EXCLUDED.compra_id,
  nome = EXCLUDED.nome,
  quantidade = EXCLUDED.quantidade,
  unidade = EXCLUDED.unidade,
  preco_unitario = EXCLUDED.preco_unitario,
  total = EXCLUDED.total,
  ordem = EXCLUDED.ordem,
  atualizado_em = EXCLUDED.atualizado_em,
  excluido_em = EXCLUDED.excluido_em,
  versao = nextval('seq_versao')
WHERE itens.atualizado_em <= EXCLUDED.atualizado_em
`;

/**
 * O mesmo id duas vezes no lote faria o Postgres recusar o comando inteiro
 * ("cannot affect row a second time"). Fica o ultimo, que e o mais recente.
 */
function semRepetidos<T extends { id: string }>(registros: readonly T[]): T[] {
  const mapa = new Map<string, T>();
  for (const registro of registros) mapa.set(registro.id, registro);
  return [...mapa.values()];
}

function compraParaBanco(c: Compra) {
  return {
    id: c.id,
    data: c.data,
    descricao: c.descricao ?? '',
    categoria: c.categoria ?? '',
    forma_pagamento: c.formaPagamento ?? '',
    observacao: c.observacao ?? '',
    total_manual: c.totalManual ?? 0,
    total: c.total ?? 0,
    qtd_itens: c.qtdItens ?? 0,
    atualizado_em: c.atualizadoEm,
    excluido_em: c.excluidoEm,
  };
}

function itemParaBanco(i: Item) {
  return {
    id: i.id,
    compra_id: i.compraId,
    nome: i.nome ?? '',
    quantidade: i.quantidade ?? 0,
    unidade: i.unidade ?? 'un',
    preco_unitario: i.precoUnitario ?? 0,
    total: i.total ?? 0,
    ordem: i.ordem ?? 0,
    atualizado_em: i.atualizadoEm,
    excluido_em: i.excluidoEm,
  };
}

function compraDoBanco(linha: Record<string, unknown>): ComVersao<Compra> {
  return {
    id: String(linha.id),
    data: numero(linha.data),
    descricao: String(linha.descricao ?? ''),
    categoria: String(linha.categoria ?? ''),
    formaPagamento: String(linha.forma_pagamento ?? ''),
    observacao: String(linha.observacao ?? ''),
    totalManual: numero(linha.total_manual),
    total: numero(linha.total),
    qtdItens: numero(linha.qtd_itens),
    atualizadoEm: numero(linha.atualizado_em),
    excluidoEm: numeroOuNulo(linha.excluido_em),
    versao: numero(linha.versao),
  };
}

function itemDoBanco(linha: Record<string, unknown>): ComVersao<Item> {
  return {
    id: String(linha.id),
    compraId: String(linha.compra_id),
    nome: String(linha.nome ?? ''),
    quantidade: numero(linha.quantidade),
    unidade: String(linha.unidade ?? 'un'),
    precoUnitario: numero(linha.preco_unitario),
    total: numero(linha.total),
    ordem: numero(linha.ordem),
    atualizadoEm: numero(linha.atualizado_em),
    excluidoEm: numeroOuNulo(linha.excluido_em),
    versao: numero(linha.versao),
  };
}

/** Aplica o que o aparelho enviou e devolve tudo que mudou depois do cursor. */
export async function sincronizar(envio: EnvioSincronizacao): Promise<RespostaSincronizacao> {
  const consultar = await banco();
  const cursor = Number.isFinite(envio.cursor) ? Math.max(0, envio.cursor) : 0;

  const compras = semRepetidos(envio.compras ?? []);
  const itens = semRepetidos(envio.itens ?? []);

  // Compras antes de itens: se a rodada cair no meio, e melhor existir uma
  // compra sem itens (que so aparece com o total errado por instantes) do que
  // itens orfaos apontando para uma compra que ninguem tem.
  if (compras.length > 0) {
    await consultar(UPSERT_COMPRAS, [JSON.stringify(compras.map(compraParaBanco))]);
  }
  if (itens.length > 0) {
    await consultar(UPSERT_ITENS, [JSON.stringify(itens.map(itemParaBanco))]);
  }

  const linhasCompras = await consultar<Record<string, unknown>>(
    'SELECT * FROM compras WHERE versao > $1 ORDER BY versao LIMIT $2',
    [cursor, LIMITE],
  );
  const linhasItens = await consultar<Record<string, unknown>>(
    'SELECT * FROM itens WHERE versao > $1 ORDER BY versao LIMIT $2',
    [cursor, LIMITE],
  );

  const comprasSaida = linhasCompras.map(compraDoBanco);
  const itensSaida = linhasItens.map(itemDoBanco);

  return {
    cursor: calcularCursor(cursor, comprasSaida, itensSaida),
    compras: comprasSaida,
    itens: itensSaida,
  };
}

/**
 * Ate onde o aparelho pode dizer que ja sabe de tudo.
 *
 * Enquanto nada foi cortado pelo LIMITE, e simplesmente a maior versao vista.
 * Se alguma das duas consultas encheu, o cursor para na menor das duas pontas
 * completas: avancar alem disso pularia registros da outra tabela que ficaram
 * de fora — exatamente o tipo de perda silenciosa que o cursor existe para
 * impedir.
 */
function calcularCursor(
  cursorAtual: number,
  compras: readonly ComVersao<Compra>[],
  itens: readonly ComVersao<Item>[],
): number {
  const cortouCompras = compras.length === LIMITE;
  const cortouItens = itens.length === LIMITE;

  if (!cortouCompras && !cortouItens) {
    const versoes = [cursorAtual, ...compras.map((c) => c.versao), ...itens.map((i) => i.versao)];
    return Math.max(...versoes);
  }

  const pontaCompras = cortouCompras ? compras[compras.length - 1]!.versao : Number.POSITIVE_INFINITY;
  const pontaItens = cortouItens ? itens[itens.length - 1]!.versao : Number.POSITIVE_INFINITY;
  return Math.max(cursorAtual, Math.min(pontaCompras, pontaItens));
}

/** Compras de um mes com seus itens, para a analise de IA. */
export async function comprasDoMes(
  inicio: number,
  fim: number,
): Promise<{ compras: Compra[]; itens: Item[] }> {
  const consultar = await banco();

  const linhasCompras = await consultar<Record<string, unknown>>(
    'SELECT * FROM compras WHERE excluido_em IS NULL AND data >= $1 AND data <= $2 ORDER BY data',
    [inicio, fim],
  );

  const compras = linhasCompras.map(compraDoBanco);
  if (compras.length === 0) return { compras: [], itens: [] };

  const linhasItens = await consultar<Record<string, unknown>>(
    `SELECT * FROM itens
     WHERE excluido_em IS NULL
       AND compra_id IN (SELECT id FROM compras WHERE excluido_em IS NULL AND data >= $1 AND data <= $2)
     ORDER BY compra_id, ordem`,
    [inicio, fim],
  );

  return { compras, itens: linhasItens.map(itemDoBanco) };
}
