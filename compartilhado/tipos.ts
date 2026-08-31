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
  /**
   * De qual conta saiu. `null` = nao informado, e ai a compra fica de fora do
   * saldo em vez de chutar uma conta errada.
   *
   * E OPCIONAL de proposito: quem so quer anotar o que comprou nunca cadastra
   * conta nenhuma, e o app tem que continuar funcionando igual para essa pessoa.
   */
  contaId: string | null;
  /**
   * Em quantas vezes. 1 = a vista, e e o padrao.
   *
   * Nao existe "compra parcelada" como coisa diferente: a fatura de um mes e a
   * soma das PARCELAS que vencem nele, e a compra a vista e o caso de uma
   * parcela so. Isso tira a ramificacao especial do resto do codigo inteiro.
   */
  parcelas: number;
}

/**
 * Onde o dinheiro esta, ou de onde ele sai.
 *
 * Uma entidade so para conta corrente, cartao de credito, vale e espécie. A
 * pergunta que revelou isso foi "de qual conta saiu esse Pix?": sem identificar
 * a origem, "quanto tenho" vira um numero so onde deveriam ser varios.
 *
 * E MENOS conceito que a alternativa, nao mais: sem ela, seriam "cartoes" mais
 * uma conta corrente implicita que ninguem consegue nomear nem conferir.
 */
export interface Conta extends Sincronizavel {
  /**
   * Como voce chama esse dinheiro. Texto livre, qualquer caractere, sem mascara
   * e sem formato: "Nubank roxinho", "Caixa 4417", "o da carteira".
   */
  apelido: string;
  tipo: TipoConta;
  /** Dia do mes em que a fatura fecha (1-31). So vale em 'credito'. */
  diaFechamento: number;
  /** Dia do mes em que a fatura vence (1-31). So vale em 'credito'. */
  diaVencimento: number;
  /** Centavos do limite do cartao. 0 = nao informado. */
  limite: number;
  /**
   * Quanto ja havia nessa conta, e desde quando. Nao se aplica a 'credito'.
   *
   * Existe porque o saldo NAO da para deduzir do historico de compras: falta o
   * dinheiro que ja estava la antes de o app existir. Informar de novo mais
   * tarde faz valer o mais recente, o que faz a leitura se autocorrigir em vez
   * de acumular desvio.
   */
  saldoInicial: number;
  saldoInicialEm: number;
  ordem: number;
}

export type TipoConta = 'corrente' | 'credito' | 'vale' | 'dinheiro';

/** Contas que guardam saldo proprio. Credito nao guarda: ele acumula fatura. */
export function temSaldo(conta: Conta): boolean {
  return conta.tipo !== 'credito';
}

/**
 * Dinheiro que entra.
 *
 * `periodicidade` e `encerradoEm` juntos resolvem o aumento de salario sem
 * reescrever o passado: mudar o valor encerra a renda antiga no fim do mes
 * anterior e cria uma nova a partir dali. Editar o valor no lugar faria janeiro
 * a junho passarem a valer o valor de julho, e todo resumo anterior ficaria
 * errado sem ninguem perceber.
 *
 * 'anual' existe por causa do 13o e das ferias: sem eles, uma projecao de doze
 * meses no Brasil esta errada por construcao.
 */
export interface Renda extends Sincronizavel {
  data: number;
  descricao: string;
  origem: string;
  /** Centavos. */
  valor: number;
  periodicidade: Periodicidade;
  /** Fim da vigencia. `null` = ainda vale. */
  encerradoEm: number | null;
  /** Onde o dinheiro cai. Recarga de vale aponta para o vale, nao para a conta. */
  contaId: string | null;
}

export type Periodicidade = 'unica' | 'mensal' | 'anual';

/**
 * Emprestimo ou financiamento.
 *
 * Comeca simples de proposito: `valorTotal` e o TOTAL A PAGAR, com juros ja
 * dentro. O app nao calcula juros, nao amortiza e nao sabe de IOF — ele so
 * precisa saber quanto sai por mes e ate quando, que e o que pesa na decisao de
 * comprar outra coisa hoje.
 */
export interface Divida extends Sincronizavel {
  descricao: string;
  tipo: 'emprestimo' | 'financiamento';
  /** Centavos do total a pagar, com juros ja embutidos. */
  valorTotal: number;
  parcelas: number;
  /** Data da primeira parcela; as demais sao mes a mes a partir dela. */
  primeiraEm: number;
  observacao: string;
}

/**
 * O que a pessoa quer comprar. E o que transforma sobra em plano.
 *
 * Sem tabela de aportes: `guardado` e um campo editavel. Uma tabela de aportes
 * duplicaria o que a conta corrente ja registra e precisaria ser reconciliada —
 * a mesma razao pela qual a fatura e derivada em vez de gravada.
 */
export interface Meta extends Sincronizavel {
  descricao: string;
  /** Centavos. */
  valorAlvo: number;
  /** Centavos ja separados. */
  guardado: number;
  /** Centavos por mes. 0 = o app sugere a partir da sobra prevista. */
  reservaMensal: number;
  /** Prazo desejado. `null` = sem prazo, e ai o app calcula a data. */
  prazoEm: number | null;
  ordem: number;
}

/**
 * Dinheiro mudando de bolso: pagar fatura, pagar parcela de divida, sacar ou
 * transferir entre contas.
 *
 * NUNCA e gasto novo. O gasto ja foi contado quando a compra foi lançada, e e
 * justamente `alvo` + `alvoId` que tornam essa distincao possivel: sem o
 * vinculo, pagar a fatura seria indistinguivel de gastar de novo, e o mes
 * fecharia com o dobro do valor.
 */
export interface Transferencia extends Sincronizavel {
  /** De onde o dinheiro saiu. */
  origemContaId: string;
  alvo: 'cartao' | 'divida' | 'conta';
  alvoId: string;
  /** Competencia quitada ("2026-09"). Vazia numa transferencia entre contas. */
  competencia: string;
  data: number;
  /** Centavos. Pagamento parcial e permitido: o resto continua devendo. */
  valor: number;
  observacao: string;
}

/**
 * "Descricao contendo X e sempre da categoria Y."
 *
 * E a unica parte da categorizacao automatica que sincroniza, porque e intencao
 * do usuario e nao deducao. O que o app aprende sozinho (descricao ja usada
 * antes) e derivado das compras e cada aparelho reconstroi o seu, como o
 * catalogo de sugestoes.
 */
export interface RegraCategoria extends Sincronizavel {
  /** Texto procurado na descricao, ja normalizado por `normalizarNome`. */
  termo: string;
  categoria: string;
  ordem: number;
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
  // As seis abaixo chegam ausentes de um aparelho que ainda nao atualizou. Os
  // dois lados leem tudo com `?? []` justamente por isso.
  contas?: Conta[];
  rendas?: Renda[];
  dividas?: Divida[];
  metas?: Meta[];
  transferencias?: Transferencia[];
  regras?: RegraCategoria[];
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
  contas: ComVersao<Conta>[];
  rendas: ComVersao<Renda>[];
  dividas: ComVersao<Divida>[];
  metas: ComVersao<Meta>[];
  transferencias: ComVersao<Transferencia>[];
  regras: ComVersao<RegraCategoria>[];
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
