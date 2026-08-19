/**
 * A analise mensal de gastos, feita pela API da Anthropic.
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
 * Sem `ANTHROPIC_API_KEY`, esta rota devolve um aviso e o resto do app segue
 * funcionando normalmente — a IA e um extra, nao um requisito.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Compra, Item } from '../compartilhado/tipos';
import { comprasDoMes } from './sincronizacao';

export class IaDesligada extends Error {
  constructor() {
    super('As dicas estão desligadas: falta configurar ANTHROPIC_API_KEY no servidor.');
    this.name = 'IaDesligada';
  }
}

export function iaLigada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
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
});

export type ResultadoDicas = z.infer<typeof EsquemaDicas>;

const INSTRUCOES = `Você analisa os gastos pessoais de uma pessoa no Brasil e responde em português do Brasil.

Sua análise vale pelo que é específico. Regras:

- Cite números reais dos dados: valores, nomes de itens, datas. "Gaste menos com supermercado" não serve; "o arroz subiu de R$ 24,90 para R$ 29,90 entre julho e agosto" serve.
- Compare com o mês anterior quando houver dados dele. Aponte o que subiu, o que caiu e o que passou a se repetir.
- Quando houver itens lançados, procure produtos que encareceram e produtos comprados com frequência alta.
- Não invente dado que não está na lista. Se a informação não permite uma conclusão, diga isso em vez de preencher com genérico.
- Não faça julgamento moral sobre os gastos e não dê conselho de investimento.
- Valores monetários chegam em centavos inteiros; escreva-os como reais no texto (185200 é R$ 1.852,00).`;

/** Uma linha por compra, com os itens indentados. Mais barato que JSON cru. */
function descrever(compras: readonly Compra[], itens: readonly Item[]): string {
  if (compras.length === 0) return '(nenhuma compra registrada)';

  const porCompra = new Map<string, Item[]>();
  for (const item of itens) {
    const lista = porCompra.get(item.compraId) ?? [];
    lista.push(item);
    porCompra.set(item.compraId, lista);
  }

  const reais = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');

  return compras
    .map((compra) => {
      const dia = new Date(compra.data).toLocaleDateString('pt-BR');
      const cabecalho = `- ${dia} | ${compra.categoria} | ${compra.formaPagamento} | R$ ${reais(compra.total)}${compra.descricao ? ' | ' + compra.descricao : ''}${compra.observacao ? ' | obs: ' + compra.observacao : ''}`;

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
  return `R$ ${(total / 100).toFixed(2).replace('.', ',')} em ${compras.length} compra(s)`;
}

/** "2026-08" -> primeiro e ultimo instante do mes, no fuso do servidor. */
function intervaloDoMes(mes: string): { inicio: number; fim: number } {
  const [ano, numeroMes] = mes.split('-').map(Number);
  if (!ano || !numeroMes || numeroMes < 1 || numeroMes > 12) {
    throw new Error('Mês inválido. Use o formato 2026-08.');
  }
  return {
    inicio: new Date(ano, numeroMes - 1, 1, 0, 0, 0, 0).getTime(),
    fim: new Date(ano, numeroMes, 1, 0, 0, 0, 0).getTime() - 1,
  };
}

function mesAnterior(mes: string): string {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const d = new Date(ano!, numeroMes! - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nomeDoMes(mes: string): string {
  const [ano, numeroMes] = mes.split('-').map(Number);
  return new Date(ano!, numeroMes! - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

export async function analisarMes(mes: string): Promise<ResultadoDicas> {
  const chave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!chave) throw new IaDesligada();

  const atual = intervaloDoMes(mes);
  const anterior = intervaloDoMes(mesAnterior(mes));

  const dadosAtual = await comprasDoMes(atual.inicio, atual.fim);
  if (dadosAtual.compras.length === 0) {
    throw new Error('Não há compras registradas neste mês para analisar.');
  }
  const dadosAnterior = await comprasDoMes(anterior.inicio, anterior.fim);

  const pergunta = [
    `MÊS ANALISADO: ${nomeDoMes(mes)} — ${totalizar(dadosAtual.compras)}`,
    descrever(dadosAtual.compras, dadosAtual.itens),
    '',
    `MÊS ANTERIOR: ${nomeDoMes(mesAnterior(mes))} — ${totalizar(dadosAnterior.compras)}`,
    descrever(dadosAnterior.compras, dadosAnterior.itens),
    '',
    'Analise o mês e aponte onde dá para economizar.',
  ].join('\n');

  const cliente = new Anthropic({ apiKey: chave });

  const resposta = await cliente.messages.parse({
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
