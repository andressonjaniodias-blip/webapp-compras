/**
 * O lado servidor da sincronizacao: recebe o que mudou no aparelho, decide quem
 * vence os conflitos e devolve tudo que mudou desde o cursor.
 *
 * A regra de conflito e uma linha de SQL: `WHERE atualizado_em <= EXCLUDED...`
 * no ON CONFLICT. Quem tem o carimbo mais novo sobrescreve; quem chegou atrasado
 * e ignorado, e o pull devolve ao aparelho a versao que venceu. Resolver no
 * banco, e nao em JavaScript, evita a janela em que duas requisicoes lidas ao
 * mesmo tempo se sobrescreveriam.
 *
 * Os lotes viajam como UM parametro jsonb e sao expandidos por
 * `jsonb_to_recordset`. A alternativa — um INSERT por registro — custaria uma
 * ida e volta HTTP por item, e uma compra de supermercado tem trinta.
 *
 * Sobre a TABELA DE TABELAS logo abaixo: com oito tabelas sincronizadas, oito
 * copias do mesmo UPSERT escrito a mao divergiriam na primeira coluna nova que
 * alguem esquecesse de acrescentar em uma delas. Descrever cada tabela uma vez e
 * gerar o SQL a partir da descricao torna esse erro impossivel — e o mapeamento
 * de ida e volta fica lado a lado, onde da para conferir de relance.
 */

import type {
  Compra,
  Conta,
  ComVersao,
  Divida,
  EnvioSincronizacao,
  Item,
  Meta,
  Renda,
  RegraCategoria,
  RespostaSincronizacao,
  Transferencia,
} from '../compartilhado/tipos';
import {
  aplicarEsquema,
  banco,
  ehEsquemaDesatualizado,
  numero,
  numeroOuNulo,
} from './banco';

/**
 * Teto por rodada. Nao e paginacao de verdade: serve para uma restauracao de
 * backup grande nao virar uma resposta de dezenas de MB. Quando corta, o cursor
 * so avanca ate onde TODAS as tabelas estao completas, e a rodada seguinte pega
 * o resto.
 */
const LIMITE = 2000;

/** Uma coluna: nome no Postgres e o tipo que o `jsonb_to_recordset` declara. */
type Coluna = readonly [nome: string, tipo: string];

interface Tabela<T> {
  nome: string;
  colunas: readonly Coluna[];
  paraBanco: (registro: T) => Record<string, unknown>;
  doBanco: (linha: Record<string, unknown>) => ComVersao<T>;
}

function texto(valor: unknown, padrao = ''): string {
  return valor === null || valor === undefined ? padrao : String(valor);
}

const TABELA_COMPRAS: Tabela<Compra> = {
  nome: 'compras',
  colunas: [
    ['id', 'text'],
    ['data', 'bigint'],
    ['descricao', 'text'],
    ['categoria', 'text'],
    ['forma_pagamento', 'text'],
    ['observacao', 'text'],
    ['total_manual', 'bigint'],
    ['total', 'bigint'],
    ['qtd_itens', 'int'],
    ['conta_id', 'text'],
    ['parcelas', 'int'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (c) => ({
    id: c.id,
    data: c.data,
    descricao: c.descricao ?? '',
    categoria: c.categoria ?? '',
    forma_pagamento: c.formaPagamento ?? '',
    observacao: c.observacao ?? '',
    total_manual: c.totalManual ?? 0,
    total: c.total ?? 0,
    qtd_itens: c.qtdItens ?? 0,
    // Compra gravada antes da v2 nao tem estes dois. `?? null` e `?? 1` mantem
    // o registro antigo valido sem precisar migrar linha nenhuma.
    conta_id: c.contaId ?? null,
    parcelas: c.parcelas ?? 1,
    atualizado_em: c.atualizadoEm,
    excluido_em: c.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    data: numero(l.data),
    descricao: texto(l.descricao),
    categoria: texto(l.categoria),
    formaPagamento: texto(l.forma_pagamento),
    observacao: texto(l.observacao),
    totalManual: numero(l.total_manual),
    total: numero(l.total),
    qtdItens: numero(l.qtd_itens),
    contaId: l.conta_id === null || l.conta_id === undefined ? null : String(l.conta_id),
    parcelas: l.parcelas === null || l.parcelas === undefined ? 1 : numero(l.parcelas),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_ITENS: Tabela<Item> = {
  nome: 'itens',
  colunas: [
    ['id', 'text'],
    ['compra_id', 'text'],
    ['nome', 'text'],
    ['quantidade', 'double precision'],
    ['unidade', 'text'],
    ['preco_unitario', 'bigint'],
    ['total', 'bigint'],
    ['ordem', 'int'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (i) => ({
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
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    compraId: texto(l.compra_id),
    nome: texto(l.nome),
    quantidade: numero(l.quantidade),
    unidade: texto(l.unidade, 'un'),
    precoUnitario: numero(l.preco_unitario),
    total: numero(l.total),
    ordem: numero(l.ordem),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_CONTAS: Tabela<Conta> = {
  nome: 'contas',
  colunas: [
    ['id', 'text'],
    ['apelido', 'text'],
    ['tipo', 'text'],
    ['dia_fechamento', 'int'],
    ['dia_vencimento', 'int'],
    ['limite', 'bigint'],
    ['saldo_inicial', 'bigint'],
    ['saldo_inicial_em', 'bigint'],
    ['ordem', 'int'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (c) => ({
    id: c.id,
    apelido: c.apelido ?? '',
    tipo: c.tipo ?? 'corrente',
    dia_fechamento: c.diaFechamento ?? 1,
    dia_vencimento: c.diaVencimento ?? 10,
    limite: c.limite ?? 0,
    saldo_inicial: c.saldoInicial ?? 0,
    saldo_inicial_em: c.saldoInicialEm ?? 0,
    ordem: c.ordem ?? 0,
    atualizado_em: c.atualizadoEm,
    excluido_em: c.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    apelido: texto(l.apelido),
    tipo: (texto(l.tipo, 'corrente') as Conta['tipo']),
    diaFechamento: numero(l.dia_fechamento),
    diaVencimento: numero(l.dia_vencimento),
    limite: numero(l.limite),
    saldoInicial: numero(l.saldo_inicial),
    saldoInicialEm: numero(l.saldo_inicial_em),
    ordem: numero(l.ordem),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_RENDAS: Tabela<Renda> = {
  nome: 'rendas',
  colunas: [
    ['id', 'text'],
    ['data', 'bigint'],
    ['descricao', 'text'],
    ['origem', 'text'],
    ['valor', 'bigint'],
    ['periodicidade', 'text'],
    ['encerrado_em', 'bigint'],
    ['conta_id', 'text'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (r) => ({
    id: r.id,
    data: r.data,
    descricao: r.descricao ?? '',
    origem: r.origem ?? '',
    valor: r.valor ?? 0,
    periodicidade: r.periodicidade ?? 'unica',
    encerrado_em: r.encerradoEm,
    conta_id: r.contaId ?? null,
    atualizado_em: r.atualizadoEm,
    excluido_em: r.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    data: numero(l.data),
    descricao: texto(l.descricao),
    origem: texto(l.origem),
    valor: numero(l.valor),
    periodicidade: (texto(l.periodicidade, 'unica') as Renda['periodicidade']),
    encerradoEm: numeroOuNulo(l.encerrado_em),
    contaId: l.conta_id === null || l.conta_id === undefined ? null : String(l.conta_id),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_DIVIDAS: Tabela<Divida> = {
  nome: 'dividas',
  colunas: [
    ['id', 'text'],
    ['descricao', 'text'],
    ['tipo', 'text'],
    ['valor_total', 'bigint'],
    ['parcelas', 'int'],
    ['primeira_em', 'bigint'],
    ['desconto_em_folha', 'boolean'],
    ['conta_id', 'text'],
    ['observacao', 'text'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (d) => ({
    id: d.id,
    descricao: d.descricao ?? '',
    tipo: d.tipo ?? 'emprestimo',
    valor_total: d.valorTotal ?? 0,
    parcelas: d.parcelas ?? 1,
    primeira_em: d.primeiraEm,
    // Divida gravada antes desta versao nao tem os dois. Os padroes mantem o
    // registro antigo valido sem migrar linha nenhuma.
    desconto_em_folha: d.descontoEmFolha ?? false,
    conta_id: d.contaId ?? null,
    observacao: d.observacao ?? '',
    atualizado_em: d.atualizadoEm,
    excluido_em: d.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    descricao: texto(l.descricao),
    tipo: (texto(l.tipo, 'emprestimo') as Divida['tipo']),
    valorTotal: numero(l.valor_total),
    parcelas: numero(l.parcelas),
    primeiraEm: numero(l.primeira_em),
    descontoEmFolha: l.desconto_em_folha === true,
    contaId: l.conta_id === null || l.conta_id === undefined ? null : String(l.conta_id),
    observacao: texto(l.observacao),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_METAS: Tabela<Meta> = {
  nome: 'metas',
  colunas: [
    ['id', 'text'],
    ['descricao', 'text'],
    ['valor_alvo', 'bigint'],
    ['guardado', 'bigint'],
    ['reserva_mensal', 'bigint'],
    ['prazo_em', 'bigint'],
    ['ordem', 'int'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (m) => ({
    id: m.id,
    descricao: m.descricao ?? '',
    valor_alvo: m.valorAlvo ?? 0,
    guardado: m.guardado ?? 0,
    reserva_mensal: m.reservaMensal ?? 0,
    prazo_em: m.prazoEm,
    ordem: m.ordem ?? 0,
    atualizado_em: m.atualizadoEm,
    excluido_em: m.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    descricao: texto(l.descricao),
    valorAlvo: numero(l.valor_alvo),
    guardado: numero(l.guardado),
    reservaMensal: numero(l.reserva_mensal),
    prazoEm: numeroOuNulo(l.prazo_em),
    ordem: numero(l.ordem),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_TRANSFERENCIAS: Tabela<Transferencia> = {
  nome: 'transferencias',
  colunas: [
    ['id', 'text'],
    ['origem_conta_id', 'text'],
    ['alvo', 'text'],
    ['alvo_id', 'text'],
    ['competencia', 'text'],
    ['data', 'bigint'],
    ['valor', 'bigint'],
    ['observacao', 'text'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (t) => ({
    id: t.id,
    origem_conta_id: t.origemContaId ?? '',
    alvo: t.alvo ?? 'cartao',
    alvo_id: t.alvoId ?? '',
    competencia: t.competencia ?? '',
    data: t.data,
    valor: t.valor ?? 0,
    observacao: t.observacao ?? '',
    atualizado_em: t.atualizadoEm,
    excluido_em: t.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    origemContaId: texto(l.origem_conta_id),
    alvo: (texto(l.alvo, 'cartao') as Transferencia['alvo']),
    alvoId: texto(l.alvo_id),
    competencia: texto(l.competencia),
    data: numero(l.data),
    valor: numero(l.valor),
    observacao: texto(l.observacao),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

const TABELA_REGRAS: Tabela<RegraCategoria> = {
  nome: 'regras',
  colunas: [
    ['id', 'text'],
    ['termo', 'text'],
    ['categoria', 'text'],
    ['ordem', 'int'],
    ['atualizado_em', 'bigint'],
    ['excluido_em', 'bigint'],
  ],
  paraBanco: (r) => ({
    id: r.id,
    termo: r.termo ?? '',
    categoria: r.categoria ?? '',
    ordem: r.ordem ?? 0,
    atualizado_em: r.atualizadoEm,
    excluido_em: r.excluidoEm,
  }),
  doBanco: (l) => ({
    id: texto(l.id),
    termo: texto(l.termo),
    categoria: texto(l.categoria),
    ordem: numero(l.ordem),
    atualizadoEm: numero(l.atualizado_em),
    excluidoEm: numeroOuNulo(l.excluido_em),
    versao: numero(l.versao),
  }),
};

/**
 * Compras ANTES de itens, e contas antes de tudo que aponta para elas: se a
 * rodada cair no meio, e melhor existir a referencia sem o dependente do que o
 * contrario. Nao ha chave estrangeira (ver o topo do `esquema.sql`), entao isto
 * e cuidado, nao exigencia do banco.
 */
const TABELAS = [
  TABELA_CONTAS,
  TABELA_COMPRAS,
  TABELA_ITENS,
  TABELA_RENDAS,
  TABELA_DIVIDAS,
  TABELA_METAS,
  TABELA_TRANSFERENCIAS,
  TABELA_REGRAS,
] as const;

/**
 * As colunas que a sincronizacao escreve, por tabela.
 *
 * Exportado para o teste conferir que TODAS existem no banco depois de aplicar
 * o esquema. Acrescentar coluna no CREATE TABLE sem o ALTER correspondente nao
 * quebra banco novo e quebra TODO banco que ja existia — e a autocura reaplica
 * um esquema que nao tem como consertar nada. Ja aconteceu duas vezes; este
 * mapa existe para a terceira ser pega por teste e nao em producao.
 */
export const COLUNAS_SINCRONIZADAS: ReadonlyMap<string, readonly string[]> = new Map(
  TABELAS.map((tabela) => [
    tabela.nome,
    [...tabela.colunas.map(([nome]) => nome), 'versao'],
  ]),
);

/** Monta o UPSERT a partir da descricao da tabela. */
function sqlUpsert(tabela: Tabela<unknown>): string {
  const nomes = tabela.colunas.map(([nome]) => nome);
  const declaracao = tabela.colunas.map(([nome, tipo]) => `${nome} ${tipo}`).join(', ');
  const selecao = nomes.map((nome) => `t.${nome}`).join(', ');
  const atualizacao = nomes
    .filter((nome) => nome !== 'id')
    .map((nome) => `  ${nome} = EXCLUDED.${nome}`)
    .join(',\n');

  return `
INSERT INTO ${tabela.nome} (${nomes.join(', ')}, versao)
SELECT ${selecao}, nextval('seq_versao')
FROM jsonb_to_recordset($1::jsonb) AS t(${declaracao})
ON CONFLICT (id) DO UPDATE SET
${atualizacao},
  versao = nextval('seq_versao')
WHERE ${tabela.nome}.atualizado_em <= EXCLUDED.atualizado_em
`;
}

/**
 * O mesmo id duas vezes no lote faria o Postgres recusar o comando inteiro
 * ("cannot affect row a second time"). Fica o ultimo, que e o mais recente.
 */
function semRepetidos<T extends { id: string }>(registros: readonly T[]): T[] {
  const mapa = new Map<string, T>();
  for (const registro of registros) mapa.set(registro.id, registro);
  return [...mapa.values()];
}

/**
 * Aplica o que o aparelho enviou e devolve tudo que mudou depois do cursor.
 *
 * A casca aqui existe por um incidente real: publicar uma versao que acrescenta
 * tabela sem rodar `npm run banco:criar` deixava TODA sincronizacao respondendo
 * 500, com o app funcionando no aparelho e nada subindo para a nuvem. O aviso na
 * documentacao nao bastou — a protecao precisava estar no codigo.
 *
 * Custo zero no caminho feliz: nada e consultado a mais enquanto o banco esta em
 * dia. Isso importa porque o driver HTTP do Neon foi escolhido justamente para
 * nao manter o banco acordado, e uma verificacao preventiva a cada rodada iria
 * contra essa decisao.
 *
 * Uma tentativa so. Se o esquema ja foi aplicado e o erro persiste, o problema e
 * outro e tem que aparecer.
 */
export async function sincronizar(envio: EnvioSincronizacao): Promise<RespostaSincronizacao> {
  try {
    return await rodarSincronizacao(envio);
  } catch (falha) {
    if (!ehEsquemaDesatualizado(falha)) throw falha;

    const aplicou = await aplicarEsquema();
    if (!aplicou) throw falha;

    console.warn(
      'Banco atras do codigo (' +
        String((falha as { code?: unknown }).code) +
        '). Esquema aplicado automaticamente; refazendo a sincronizacao.',
    );
    return await rodarSincronizacao(envio);
  }
}

async function rodarSincronizacao(envio: EnvioSincronizacao): Promise<RespostaSincronizacao> {
  const consultar = await banco();
  const cursor = Number.isFinite(envio.cursor) ? Math.max(0, envio.cursor) : 0;

  // Toda lista e lida com `?? []`: um aparelho que ainda nao atualizou manda so
  // compras e itens, e tem que continuar sincronizando normalmente.
  const enviados: Record<string, readonly { id: string }[]> = {
    contas: envio.contas ?? [],
    compras: envio.compras ?? [],
    itens: envio.itens ?? [],
    rendas: envio.rendas ?? [],
    dividas: envio.dividas ?? [],
    metas: envio.metas ?? [],
    transferencias: envio.transferencias ?? [],
    regras: envio.regras ?? [],
  };

  for (const tabela of TABELAS) {
    const lote = semRepetidos(enviados[tabela.nome] ?? []);
    if (lote.length === 0) continue;
    const linhas = lote.map((registro) =>
      (tabela as Tabela<unknown>).paraBanco(registro as never),
    );
    await consultar(sqlUpsert(tabela as Tabela<unknown>), [JSON.stringify(linhas)]);
  }

  const saida: Record<string, ComVersao<unknown>[]> = {};
  const brutas: ComVersao<unknown>[][] = [];

  for (const tabela of TABELAS) {
    const linhas = await consultar<Record<string, unknown>>(
      `SELECT * FROM ${tabela.nome} WHERE versao > $1 ORDER BY versao LIMIT $2`,
      [cursor, LIMITE],
    );
    const convertidas = linhas.map((linha) => (tabela as Tabela<unknown>).doBanco(linha));
    saida[tabela.nome] = convertidas;
    brutas.push(convertidas);
  }

  return {
    cursor: calcularCursor(cursor, brutas),
    compras: saida.compras as ComVersao<Compra>[],
    itens: saida.itens as ComVersao<Item>[],
    contas: saida.contas as ComVersao<Conta>[],
    rendas: saida.rendas as ComVersao<Renda>[],
    dividas: saida.dividas as ComVersao<Divida>[],
    metas: saida.metas as ComVersao<Meta>[],
    transferencias: saida.transferencias as ComVersao<Transferencia>[],
    regras: saida.regras as ComVersao<RegraCategoria>[],
  };
}

/**
 * Ate onde o aparelho pode dizer que ja sabe de tudo.
 *
 * Enquanto nada foi cortado pelo LIMITE, e simplesmente a maior versao vista. Se
 * alguma consulta encheu, o cursor para na menor das pontas COMPLETAS: avancar
 * alem disso pularia registros das outras tabelas que ficaram de fora —
 * exatamente o tipo de perda silenciosa que o cursor existe para impedir.
 *
 * Escrito para N listas de proposito. Com oito tabelas, uma versao fixa em duas
 * seria a proxima a quebrar em silencio.
 */
function calcularCursor(cursorAtual: number, listas: readonly ComVersao<unknown>[][]): number {
  const cortadas = listas.filter((lista) => lista.length === LIMITE);

  if (cortadas.length === 0) {
    const versoes = listas.flatMap((lista) => lista.map((registro) => registro.versao));
    return Math.max(cursorAtual, ...versoes);
  }

  const pontas = cortadas.map((lista) => lista[lista.length - 1]!.versao);
  return Math.max(cursorAtual, Math.min(...pontas));
}

/** Tudo que a analise de IA precisa ler do banco de uma vez so. */
export async function dadosParaAnalise(
  inicio: number,
  fim: number,
): Promise<{
  compras: Compra[];
  itens: Item[];
  contas: Conta[];
  rendas: Renda[];
  dividas: Divida[];
  metas: Meta[];
  transferencias: Transferencia[];
}> {
  const consultar = await banco();

  const vivas = async <T>(tabela: Tabela<T>): Promise<T[]> => {
    const linhas = await consultar<Record<string, unknown>>(
      `SELECT * FROM ${tabela.nome} WHERE excluido_em IS NULL`,
    );
    return linhas.map((linha) => tabela.doBanco(linha));
  };

  // Compras vem de TODO o historico, e nao so do mes: parcela lançada em maio
  // pesa na fatura de setembro, e a analise erraria feio sem ela.
  const compras = await vivas(TABELA_COMPRAS);

  const linhasItens = await consultar<Record<string, unknown>>(
    `SELECT i.* FROM itens i
     JOIN compras c ON c.id = i.compra_id
     WHERE i.excluido_em IS NULL AND c.excluido_em IS NULL
       AND c.data >= $1 AND c.data <= $2
     ORDER BY i.compra_id, i.ordem`,
    [inicio, fim],
  );

  return {
    compras: compras.sort((a, b) => a.data - b.data),
    itens: linhasItens.map((linha) => TABELA_ITENS.doBanco(linha)),
    contas: await vivas(TABELA_CONTAS),
    rendas: await vivas(TABELA_RENDAS),
    dividas: await vivas(TABELA_DIVIDAS),
    metas: await vivas(TABELA_METAS),
    transferencias: await vivas(TABELA_TRANSFERENCIAS),
  };
}

/** Compras de um mes com seus itens. Mantido para o que so precisa do mes. */
export async function comprasDoMes(
  inicio: number,
  fim: number,
): Promise<{ compras: Compra[]; itens: Item[] }> {
  const dados = await dadosParaAnalise(inicio, fim);
  return {
    compras: dados.compras.filter((c) => c.data >= inicio && c.data <= fim),
    itens: dados.itens,
  };
}
