/**
 * A analise de gastos feita pela API da Anthropic.
 *
 * Dois cuidados de desenho:
 *
 * 1. **A chave nunca chega perto do navegador.** Ela vive so aqui, como
 *    variavel de ambiente. Se o app chamasse a API direto do celular, a chave
 *    estaria no JavaScript publicado e qualquer visitante poderia extrai-la e
 *    gastar na conta.
 * 2. **Os dados sao lidos do proprio banco**, e nao recebidos do cliente. A
 *    requisicao carrega so o mes; o resto o servidor busca. Isso mantem o
 *    payload minusculo e tira do cliente a possibilidade de mandar numero
 *    inventado para a analise.
 *
 * A VIRADA DE EIXO DA v2: alem de explicar o mes que passou, a analise agora
 * recebe a previsao dos proximos meses e as metas. A pergunta que ela responde
 * deixou de ser "para onde foi o dinheiro" e passou a ser "quanto da para
 * comprometer daqui para frente sem estourar".
 *
 * Sem `ANTHROPIC_API_KEY`, estas rotas devolvem um aviso e o resto do app segue
 * funcionando normalmente — a IA e um extra, nao um requisito.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { grupoDaCategoria } from '../compartilhado/constantes';
import {
  calcularCarteira,
  compromissos,
  resumoDoMes,
  type DadosFinanceiros,
} from '../compartilhado/carteira';
import { chaveDoMes, intervaloDoMes, somarMeses } from '../compartilhado/fatura';
import { vezesDa } from '../compartilhado/parcelamento';
import {
  estimarGastoCorrente,
  mesesAteAMetaMaisLonga,
  planejarMeta,
  projetar,
} from '../compartilhado/previsao';
import { normalizarNome, type Compra, type Item } from '../compartilhado/tipos';
import { dadosParaAnalise } from './sincronizacao';

export class IaDesligada extends Error {
  constructor() {
    super('As dicas estão desligadas: falta configurar ANTHROPIC_API_KEY no servidor.');
    this.name = 'IaDesligada';
  }
}

export function iaLigada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function cliente(): Anthropic {
  const chave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!chave) throw new IaDesligada();
  return new Anthropic({ apiKey: chave });
}

const EsquemaDicas = z.object({
  resumo: z.string().describe('Dois ou tres periodos sobre como foi o mes, em portugues do Brasil.'),
  achados: z
    .array(
      z.object({
        titulo: z.string().describe('Frase curta, ate 8 palavras.'),
        detalhe: z.string().describe('Explicacao com os numeros que sustentam o achado.'),
        economiaEstimadaCentavos: z
          .number()
          .nullable()
          .describe('Quanto daria para economizar por mes, em centavos. null quando nao der para estimar.'),
      }),
    )
    .describe('De 2 a 5 achados concretos, do mais relevante para o menos.'),
  sugestoes: z
    .array(z.string())
    .describe('De 2 a 4 acoes praticas, cada uma numa frase.'),
  previsao: z
    .string()
    .describe(
      'Dois ou tres periodos sobre os proximos meses: quanto da para comprometer por mes sem estourar, e qual e o mes mais apertado e por que.',
    ),
  metas: z
    .string()
    .describe(
      'Uma ou duas frases sobre as metas: elas cabem no ritmo atual? Se nao houver meta cadastrada, diga isso em uma frase.',
    ),
});

export type ResultadoDicas = z.infer<typeof EsquemaDicas>;

const INSTRUCOES = `Você analisa os gastos pessoais de uma pessoa no Brasil e responde em português do Brasil.

Sua análise vale pelo que é específico. Regras:

- Cite números reais dos dados: valores, nomes de itens, datas. "Gaste menos com supermercado" não serve; "o arroz subiu de R$ 24,90 para R$ 29,90 entre julho e agosto" serve.
- Compare com o mês anterior quando houver dados dele. Aponte o que subiu, o que caiu e o que passou a se repetir.
- Quando houver itens lançados, procure produtos que encareceram e produtos comprados com frequência alta.
- Não invente dado que não está na lista. Se a informação não permite uma conclusão, diga isso em vez de preencher com genérico.
- Não faça julgamento moral sobre os gastos e não dê conselho de investimento.
- Valores monetários chegam em centavos inteiros; escreva-os como reais no texto (185200 é R$ 1.852,00).

Como o dinheiro se move neste app — errar isto invalida a análise inteira:

- Compra no crédito NÃO é saída de caixa no mês da compra. Ela vira fatura, e é o pagamento da fatura que tira dinheiro da conta, no mês seguinte. Nunca some as duas coisas como se fossem gastos diferentes.
- Uma compra em 12x pesa a PARCELA por mês, não o total. Ao falar de quanto sobra, use a parcela.
- Pagamento de fatura, parcela de dívida, saque e transferência não são gastos novos: o gasto já foi contado quando a compra foi lançada.
- O "gasto estimado" da previsão é média histórica, não compromisso. Trate como estimativa e diga que é.

Sobre a previsão, que é o que mais interessa a quem lê:

- Diga quanto dá para comprometer por mês daqui para frente sem estourar, com o número.
- Aponte o mês mais apertado dos próximos meses e explique de onde vem o aperto.
- Avalie se as metas cadastradas cabem no ritmo atual de sobra.`;

const reais = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');

/** Uma linha por compra, com os itens indentados. Mais barato que JSON cru. */
function descrever(
  compras: readonly Compra[],
  itens: readonly Item[],
  dados: DadosFinanceiros,
): string {
  if (compras.length === 0) return '(nenhuma compra registrada)';

  const porCompra = new Map<string, Item[]>();
  for (const item of itens) {
    const lista = porCompra.get(item.compraId) ?? [];
    lista.push(item);
    porCompra.set(item.compraId, lista);
  }

  const apelidos = new Map(dados.contas.map((c) => [c.id, c.apelido]));

  return compras
    .map((compra) => {
      const dia = new Date(compra.data).toLocaleDateString('pt-BR');
      const conta = compra.contaId ? apelidos.get(compra.contaId) : undefined;
      const vezes = vezesDa(compra);
      const partes = [
        `- ${dia}`,
        `${compra.categoria} (${grupoDaCategoria(compra.categoria)})`,
        compra.formaPagamento,
        `R$ ${reais(compra.total)}`,
      ];
      if (vezes > 1) partes.push(`${vezes}x de R$ ${reais(Math.floor(compra.total / vezes))}`);
      if (conta) partes.push(conta);
      if (compra.descricao) partes.push(compra.descricao);
      if (compra.observacao) partes.push('obs: ' + compra.observacao);

      const cabecalho = partes.join(' | ');
      const seus = (porCompra.get(compra.id) ?? []).sort((a, b) => a.ordem - b.ordem);
      if (seus.length === 0) return cabecalho + '\n    (lançada só com o total, sem itens)';

      const linhas = seus.map(
        (i) =>
          `    * ${i.nome} | ${i.quantidade} ${i.unidade} | unit. R$ ${reais(i.precoUnitario)} | total R$ ${reais(i.total)}`,
      );
      return [cabecalho, ...linhas].join('\n');
    })
    .join('\n');
}

function totalizar(compras: readonly Compra[]): string {
  const total = compras.reduce((soma, c) => soma + c.total, 0);
  return `R$ ${reais(total)} em ${compras.length} compra(s)`;
}

function nomeDoMes(mes: string): string {
  const [ano, numeroMes] = mes.split('-').map(Number);
  return new Date(ano!, numeroMes! - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

function validarMes(mes: string): void {
  const [ano, numeroMes] = mes.split('-').map(Number);
  if (!ano || !numeroMes || numeroMes < 1 || numeroMes > 12) {
    throw new Error('Mês inválido. Use o formato 2026-08.');
  }
}

/** Entradas, saldo por conta e a leitura de caixa do mes. */
function blocoDoCaixa(dados: DadosFinanceiros, mes: string, agora: number): string {
  const carteira = calcularCarteira(dados, agora);
  const fechamento = resumoDoMes(dados, mes, agora);

  if (dados.rendas.length === 0 && carteira.contas.length === 0) {
    return 'SALDO E ENTRADAS: nada cadastrado — o usuário só registra compras. Não fale de sobra nem de saldo.';
  }

  const contas = carteira.contas
    .map((s) => `  - ${s.conta.apelido} (${s.conta.tipo}): R$ ${reais(s.saldo)}`)
    .join('\n');

  return [
    'SALDO E ENTRADAS',
    `  entrou no mês: R$ ${reais(fechamento.entradas)}`,
    `  saiu do caixa no mês (débito/pix/dinheiro): R$ ${reais(fechamento.saidasAVista)}`,
    `  comprado no crédito no mês (vira fatura, NÃO saiu ainda): R$ ${reais(fechamento.noCredito)}`,
    `  destes, viram parcela de meses seguintes: R$ ${reais(fechamento.adiadoEmParcelas)}`,
    `  gasto no vale: R$ ${reais(fechamento.noVale)}`,
    `  faturas e parcelas pagas no mês: R$ ${reais(fechamento.pagamentos)}`,
    `  ainda a vencer no mês: R$ ${reais(fechamento.aVencer)}`,
    `  sobra do mês: R$ ${reais(fechamento.sobra)}`,
    '  saldo por conta hoje:',
    contas || '  (nenhuma conta cadastrada)',
    `  total em conta: R$ ${reais(carteira.saldoEmConta)} | em vales: R$ ${reais(carteira.saldoEmVales)}`,
    carteira.semConta.quantidade > 0
      ? `  ATENÇÃO: ${carteira.semConta.quantidade} compra(s) sem conta definida, somando R$ ${reais(carteira.semConta.total)} — ficam fora do saldo.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function blocoDosCompromissos(dados: DadosFinanceiros, agora: number): string {
  const lista = compromissos(dados, agora).filter((c) => c.falta.restante > 0);
  if (lista.length === 0) return 'FATURAS E DÍVIDAS: nada em aberto.';

  const linhas = lista.map((item) => {
    const tipo = item.origem === 'cartao' ? 'cartão' : 'dívida';
    const limite =
      item.disponivel !== null ? ` | disponível no limite: R$ ${reais(item.disponivel)}` : '';
    const ate = item.falta.ultima ? ` | última em ${item.falta.ultima}` : '';
    return `  - ${item.descricao} (${tipo}): falta R$ ${reais(item.falta.restante)} em ${item.falta.parcelasRestantes} competência(s)${ate}${limite}`;
  });

  const total = lista.reduce((soma, item) => soma + item.falta.restante, 0);
  return ['FATURAS E DÍVIDAS', ...linhas, `  total comprometido: R$ ${reais(total)}`].join('\n');
}

function blocoDaPrevisao(dados: DadosFinanceiros, agora: number, meses: number): string {
  const linhas = projetar(dados, { meses, agora });
  const estimativa = estimarGastoCorrente(dados, agora);

  if (dados.rendas.length === 0) {
    return 'PREVISÃO: sem renda cadastrada, não há previsão. Não invente uma.';
  }

  const tabela = linhas.map(
    (l) =>
      `  ${l.mes}${l.parcial ? ' (parcial)' : '      '} | entra R$ ${reais(l.entradas)} | comprometido R$ ${reais(l.comprometido)} | metas R$ ${reais(l.reservaMetas)} | estimado R$ ${reais(l.estimado)} | sobra R$ ${reais(l.sobra)} | saldo ao fim R$ ${reais(l.saldoAcumulado)}`,
  );

  const qualidade = estimativa.manual
    ? 'informado pelo usuário'
    : estimativa.fraca
      ? `média fraca: só ${estimativa.mesesUsados} mês(es) de histórico`
      : `média de ${estimativa.mesesUsados} meses completos`;

  return [
    `PREVISÃO DOS PRÓXIMOS ${linhas.length} MESES`,
    `  gasto corrente estimado: R$ ${reais(estimativa.total)}/mês (fixos R$ ${reais(estimativa.fixo)} + variáveis R$ ${reais(estimativa.variavel)}) — ${qualidade}`,
    '  o estimado é palpite; o comprometido é certo. Categorias eventuais não entram no estimado.',
    ...tabela,
  ].join('\n');
}

function blocoDasMetas(dados: DadosFinanceiros, agora: number, sobraMensal: number): string {
  const ativas = dados.metas.filter((m) => m.guardado < m.valorAlvo);
  if (ativas.length === 0) return 'METAS: nenhuma cadastrada.';

  const linhas = ativas.map((meta) => {
    const plano = planejarMeta(meta, sobraMensal, agora);
    const prazo =
      plano.reservaNecessaria !== null
        ? ` | com prazo, precisaria de R$ ${reais(plano.reservaNecessaria)}/mês (${plano.cabeNaSobra ? 'cabe' : 'NÃO cabe'} na sobra)`
        : '';
    const quando = plano.competenciaAlvo ? ` | no ritmo atual chega em ${plano.competenciaAlvo}` : ' | no ritmo atual não chega';
    return `  - ${meta.descricao}: R$ ${reais(meta.guardado)} de R$ ${reais(meta.valorAlvo)}, falta R$ ${reais(plano.falta)}${quando}${prazo}`;
  });

  return ['METAS', ...linhas].join('\n');
}

export async function analisarMes(mes: string): Promise<ResultadoDicas> {
  const anthropic = cliente();
  validarMes(mes);

  const agora = Date.now();
  const atual = intervaloDoMes(mes);
  const anteriorChave = somarMeses(mes, -1);
  const anterior = intervaloDoMes(anteriorChave);

  const dados = await dadosParaAnalise(atual.inicio, atual.fim);
  const comprasAtual = dados.compras.filter((c) => c.data >= atual.inicio && c.data <= atual.fim);
  if (comprasAtual.length === 0) {
    throw new Error('Não há compras registradas neste mês para analisar.');
  }

  const dadosAnterior = await dadosParaAnalise(anterior.inicio, anterior.fim);
  const comprasAnterior = dadosAnterior.compras.filter(
    (c) => c.data >= anterior.inicio && c.data <= anterior.fim,
  );

  const meses = Math.max(12, mesesAteAMetaMaisLonga(dados.metas, agora));
  const previsao = projetar(dados, { meses, agora });
  const sobraMensal = previsao.filter((l) => !l.parcial)[0]?.sobra ?? 0;

  const pergunta = [
    `MÊS ANALISADO: ${nomeDoMes(mes)} — ${totalizar(comprasAtual)}`,
    descrever(comprasAtual, dados.itens, dados),
    '',
    `MÊS ANTERIOR: ${nomeDoMes(anteriorChave)} — ${totalizar(comprasAnterior)}`,
    descrever(comprasAnterior, dadosAnterior.itens, dadosAnterior),
    '',
    blocoDoCaixa(dados, mes, agora),
    '',
    blocoDosCompromissos(dados, agora),
    '',
    blocoDasMetas(dados, agora, sobraMensal),
    '',
    blocoDaPrevisao(dados, agora, meses),
    '',
    'Analise o mês, aponte onde dá para economizar e diga quanto dá para comprometer por mês daqui para frente.',
  ].join('\n');

  const resposta = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: INSTRUCOES,
    // O pensamento adaptativo ja e o padrao deste modelo. `effort: medium`
    // porque a analise e recorrente e barata: gastar mais raciocinio aqui
    // encareceria sem melhorar uma leitura de lista de compras.
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(EsquemaDicas),
    },
    messages: [{ role: 'user', content: pergunta }],
  });

  if (resposta.stop_reason === 'refusal') {
    throw new Error('O modelo recusou a análise deste mês.');
  }
  if (!resposta.parsed_output) {
    throw new Error('A análise voltou num formato inesperado. Tente de novo.');
  }

  return resposta.parsed_output;
}

// ---------------------------------------------------------- regras de categoria

const EsquemaRegras = z.object({
  regras: z
    .array(
      z.object({
        termo: z
          .string()
          .describe(
            'Trecho curto que aparece na descricao das compras, em minusculas e sem acento. Ex: "bom preco", "posto".',
          ),
        categoria: z.string().describe('Uma das categorias exatamente como listadas.'),
        motivo: z.string().describe('Uma frase curta dizendo em que o termo se apoia.'),
      }),
    )
    .describe('De 0 a 12 regras, so quando o padrao for claro no historico.'),
});

export interface RegraProposta {
  termo: string;
  categoria: string;
  motivo: string;
}

const INSTRUCOES_REGRAS = `Você lê o histórico de compras de uma pessoa no Brasil e propõe regras de categoria.

Uma regra diz: "quando a descrição da compra contiver TERMO, a categoria é CATEGORIA".

Regras do seu trabalho:

- Proponha apenas o que o histórico sustenta. Se um termo aparece com duas categorias diferentes, não proponha regra para ele.
- O termo deve ser curto, em minúsculas, sem acento, e específico o bastante para não pegar compra errada. "posto" serve; "a" não.
- Prefira o pedaço estável do nome. Em "Supermercado Bom Preço Centro" e "Bom Preço Shopping", o termo é "bom preco".
- Use apenas as categorias da lista fornecida, escritas exatamente como estão lá.
- Não proponha regra para descrição que apareceu uma vez só.
- É melhor devolver três regras certas do que doze duvidosas. Lista vazia é uma resposta válida.`;

/**
 * A IA propoe REGRAS, e nao a categoria de cada compra.
 *
 * Categorizar lançamento a lançamento custaria uma chamada de API por compra,
 * nao funcionaria offline e ficaria caro rapido. Aqui ela le o historico uma vez
 * e devolve regras que o usuario revisa: uma chamada, beneficio permanente, e o
 * que ela produz continua valendo sem internet depois.
 */
export async function proporRegras(): Promise<RegraProposta[]> {
  const anthropic = cliente();

  const agora = Date.now();
  const { inicio } = intervaloDoMes(somarMeses(chaveDoMes(agora), -12));
  const dados = await dadosParaAnalise(inicio, agora);

  // Descricao normalizada -> categorias com que ela ja foi usada.
  const usos = new Map<string, { exemplo: string; categorias: Map<string, number> }>();
  for (const compra of dados.compras) {
    const chave = normalizarNome(compra.descricao);
    if (!chave) continue;
    const uso = usos.get(chave) ?? { exemplo: compra.descricao.trim(), categorias: new Map() };
    uso.categorias.set(compra.categoria, (uso.categorias.get(compra.categoria) ?? 0) + 1);
    usos.set(chave, uso);
  }

  if (usos.size === 0) {
    throw new Error('Não há histórico de compras suficiente para propor regras.');
  }

  const linhas = [...usos.entries()]
    .map(([chave, uso]) => {
      const categorias = [...uso.categorias.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([categoria, n]) => `${categoria} x${n}`)
        .join(', ');
      return `- "${uso.exemplo}" (chave: ${chave}) -> ${categorias}`;
    })
    .sort()
    .join('\n');

  const { CATEGORIAS } = await import('../compartilhado/constantes');

  const resposta = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: INSTRUCOES_REGRAS,
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(EsquemaRegras),
    },
    messages: [
      {
        role: 'user',
        content: [
          'CATEGORIAS DISPONÍVEIS:',
          CATEGORIAS.join(' · '),
          '',
          'DESCRIÇÕES JÁ USADAS E AS CATEGORIAS DELAS:',
          linhas,
          '',
          'Proponha as regras que o histórico sustenta.',
        ].join('\n'),
      },
    ],
  });

  if (resposta.stop_reason === 'refusal') {
    throw new Error('O modelo recusou propor regras.');
  }
  if (!resposta.parsed_output) {
    throw new Error('A resposta veio num formato inesperado. Tente de novo.');
  }

  const validas = new Set<string>(CATEGORIAS);
  return resposta.parsed_output.regras
    .map((regra) => ({ ...regra, termo: normalizarNome(regra.termo) }))
    .filter((regra) => regra.termo.length >= 3 && validas.has(regra.categoria));
}
