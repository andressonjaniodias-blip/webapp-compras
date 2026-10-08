/**
 * Que modelo da Anthropic faz as analises, e por que a lista e fechada.
 *
 * O modelo vem da variavel `MODELO_IA`, para dar para trocar no painel do
 * servidor sem publicar codigo: comecar no mais barato e subir se a analise
 * parecer rasa e uma decisao de uso, nao de programacao.
 *
 * A LISTA E FECHADA porque os modelos nao aceitam a mesma chamada. As duas
 * rotas de `servidor/dicas.ts` enviam `output_config.effort` e saida
 * estruturada, e contam com o pensamento adaptativo ligado por padrao. Os tres
 * modelos abaixo aceitam exatamente isso. O Haiku 4.5, por exemplo, rejeita
 * `effort` com erro — aceita-lo aqui trocaria um erro de digitacao visivel por
 * uma falha na hora da analise.
 *
 * Pelo mesmo motivo, valor desconhecido cai no padrao em vez de seguir adiante:
 * e o mesmo trato que `planoValido` da ao plano.
 *
 * Precos por milhao de tokens (entrada / saida), em 08/10/2026:
 *
 *   claude-haiku-5-5    US$ 0,10 / 0,50   o padrao
 *   claude-sonnet-5-5   US$ 2 / 10
 *   claude-opus-5-5     US$ 4 / 20
 *
 * Ao acrescentar um modelo, confira antes que ele aceita a chamada como esta.
 */

export const MODELOS_DE_IA = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;

export type ModeloDeIa = (typeof MODELOS_DE_IA)[number];

export const MODELO_DE_IA_PADRAO: ModeloDeIa = 'claude-haiku-5-5';

/** Aceita so os modelos da lista; qualquer outra coisa vira o padrao. */
export function modeloValido(valor: unknown): ModeloDeIa {
  return (MODELOS_DE_IA as readonly unknown[]).includes(valor)
    ? (valor as ModeloDeIa)
    : MODELO_DE_IA_PADRAO;
}
