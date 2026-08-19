/**
 * O vocabulario do projeto, usado dos dois lados: no aparelho e no servidor.
 *
 * Existe aqui, e nao dentro de `src/`, porque cliente e servidor precisam
 * concordar byte a byte sobre o formato dos registros que trafegam na
 * sincronizacao. Duas copias do mesmo tipo divergem em silencio.
 *
 * Duas regras valem para o projeto inteiro:
 *
 * 1. Dinheiro e SEMPRE inteiro em centavos. Ponto flutuante erra centavos ao
 *    somar (0.1 + 0.2 !== 0.3) e num controle de gastos esse erro so aparece no
 *    fechamento do mes, quando ja e tarde para descobrir de onde veio.
 * 2. Tempo e SEMPRE inteiro em milissegundos (`Date.now()`). Converter para
 *    Date e voltar arredonda e pode bagunçar a ordem numa sincronizacao.
 */

/** Campos que todo registro sincronizavel carrega. */
export interface Sincronizavel {
  /**
   * Identidade estavel entre aparelhos. E UUID, e nao autoincremento, porque
   * celular e PC criariam `id = 1` para compras diferentes — e a sincronizacao
   * nao teria como saber que sao coisas distintas.
   */
  id: string;
  /** Ultima modificacao. E por ele que um conflito se resolve: maior vence. */
  atualizadoEm: number;
  /**
   * Exclusao logica. Sem lapide, apagar no celular nao teria como se propagar:
   * o registro voltaria do PC na sincronizacao seguinte.
   */
  excluidoEm: number | null;
}

export interface Compra extends Sincronizavel {
  /** Quando a compra aconteceu. Editavel, para lançamento retroativo. */
  data: number;
  /** Texto livre: "Mercado do bairro", "Posto da rodovia". */
  descricao: string;
  categoria: string;
  formaPagamento: string;
  observacao: string;
  /** Centavos digitados a mao. So vale quando a compra nao tem itens. */
  totalManual: number;
  /** Centavos. Denormalizado: soma dos itens, ou `totalManual` se nao houver. */
  total: number;
  /** Denormalizado para a lista nao precisar carregar os itens de cada compra. */
  qtdItens: number;
}

export interface Item extends Sincronizavel {
  compraId: string;
  nome: string;
  /** Decimal — permite 1,235 kg. */
  quantidade: number;
  unidade: string;
  /**
   * Centavos. E o preco de prateleira, guardado como informacao historica para
   * comparar precos ao longo do tempo. NUNCA e usado para recalcular dinheiro.
   */
  precoUnitario: number;
  /**
   * Centavos, e este e o numero que manda.
   *
   * E digitavel de proposito: a balança do mercado imprime o total ja
   * arredondado do jeito dela. 1,235 kg a R$ 14,99 da R$ 18,5126, que viraria
   * R$ 18,51 numa multiplicacao, mas o cupom diz R$ 18,52. Se o app so soubesse
   * multiplicar, a compra nunca fecharia com a nota.
   */
  total: number;
  /** Mantem a ordem em que os itens foram lançados no carrinho. */
  ordem: number;
}

/** Um registro como o servidor devolve: com o numero de versao dele. */
export type ComVersao<T> = T & { versao: number };

/**
 * O que o aparelho manda ao sincronizar: o que mudou aqui desde a ultima vez,
 * mais o cursor que diz ate onde ele ja sabe o que aconteceu la.
 */
export interface EnvioSincronizacao {
  cursor: number;
  compras: Compra[];
  itens: Item[];
}

/**
 * O que o servidor devolve: tudo que mudou depois do cursor — inclusive o que
 * o proprio aparelho acabou de enviar, o que da a ele os numeros de versao sem
 * precisar de uma segunda rodada.
 */
export interface RespostaSincronizacao {
  cursor: number;
  compras: ComVersao<Compra>[];
  itens: ComVersao<Item>[];
}

/** Subtotal de um item a partir de quantidade e preco, sempre arredondado. */
export function calcularTotalItem(quantidade: number, precoUnitario: number): number {
  return Math.round(quantidade * precoUnitario);
}

/** Preco unitario implicito num total, para preencher o campo quando vazio. */
export function calcularPrecoUnitario(total: number, quantidade: number): number {
  if (quantidade <= 0) return 0;
  return Math.round(total / quantidade);
}

/**
 * A regra que torna o detalhamento opcional: se a compra tem itens, o total e a
 * soma deles; se nao tem, e o valor digitado a mao. Isso deixa voce escolher o
 * nivel de detalhe compra a compra — item a item no supermercado, so o total no
 * posto de gasolina.
 */
export function calcularTotalCompra(totalManual: number, itens: readonly Item[]): number {
  const vivos = itens.filter(naoExcluido);
  if (vivos.length === 0) return totalManual;
  return vivos.reduce((soma, item) => soma + item.total, 0);
}

/** Um registro so conta se nao estiver na lapide. */
export function naoExcluido(registro: Sincronizavel): boolean {
  return registro.excluidoEm === null || registro.excluidoEm === undefined;
}

/**
 * `crypto.randomUUID` existe no Node e no navegador em contexto seguro (HTTPS
 * ou localhost), que e onde o app roda. O caminho alternativo evita um erro
 * dificil de diagnosticar caso alguem sirva o app por HTTP simples.
 */
export function novoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // versao 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Chave de agrupamento de um item no catalogo de sugestoes: minusculo, sem
 * acento e sem espaço sobrando. "Arroz Branco" e "arroz  branco" sao a mesma
 * coisa na hora de lembrar quanto voce pagou da ultima vez.
 */
export function normalizarNome(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * O total digitado diverge do calculado a ponto de merecer aviso?
 *
 * Nem toda diferenca e erro. A balança do mercado arredonda: 1,235 kg a
 * R$ 14,99 da R$ 18,5126, o app calcularia R$ 18,51 e o cupom imprime R$ 18,52.
 * Avisar nesse caso seria alarme falso em toda compra de carne, e alarme que
 * dispara sempre e alarme que ninguem le.
 *
 * A margem aceita e o quanto o arredondamento consegue explicar: meio centavo
 * por unidade (o preco unitario ja vem arredondado) mais meio centavo do
 * arredondamento do proprio total. Acima disso e erro de digitacao de verdade —
 * preco no lugar do total, virgula fora do lugar — e ai vale interromper.
 */
export function divergenciaSuspeita(
  quantidade: number,
  precoUnitario: number,
  total: number,
): boolean {
  if (quantidade <= 0 || precoUnitario <= 0 || total <= 0) return false;
  const calculado = calcularTotalItem(quantidade, precoUnitario);
  const margem = Math.ceil(quantidade * 0.5) + 1;
  return Math.abs(calculado - total) > margem;
}
