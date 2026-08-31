/**
 * Listas fixas que aparecem como botoes na tela. Ficam aqui, e nao no banco,
 * porque sao poucas e mudam raramente — e porque um seletor com opcao fixa e
 * mais rapido de tocar no corredor do mercado do que um campo de texto.
 *
 * Nao ha "outra": qualquer valor gravado antes continua valendo mesmo que suma
 * daqui, porque o campo e texto no banco. O `SeletorChips` mostra valor gravado
 * fora da lista como opcao extra, entao nada de historico se perde.
 *
 * Sobre o GRUPO de cada categoria: ele nao e etiqueta decorativa, e o que
 * impede a previsao de mentir. Com uma media unica de gastos, R$ 1.200 gastos
 * em "Casa" num mes fariam o app prever R$ 400 a mais TODO MES, para sempre.
 * Separando em fixo / variavel / eventual, o que nao se repete deixa de ser
 * projetado e a distorcao some. Ver `previsao.ts`.
 */

export const CATEGORIAS = [
  'Mercado',
  'Comer fora',
  'Transporte',
  'Combustível',
  'Casa',
  'Contas de casa',
  'Assinaturas',
  'Farmácia',
  'Saúde',
  'Educação',
  'Vestuário',
  'Beleza e cuidados',
  'Lazer',
  'Pets',
  'Presentes',
  'Taxas e impostos',
  'Outros',
] as const;

/**
 * Como a previsao trata cada categoria.
 *
 * - `fixo`     repete todo mes com valor parecido (luz, internet, escola, IPVA).
 *              Projeta pela media dos fixos, que e estavel.
 * - `variavel` repete oscilando (mercado, combustivel, farmacia). Projeta pela
 *              media dos variaveis.
 * - `eventual` nao repete de forma previsivel (uma geladeira, uma cirurgia, um
 *              presente). NAO e projetado.
 */
export type GrupoCategoria = 'fixo' | 'variavel' | 'eventual';

export const GRUPO_DA_CATEGORIA: Readonly<Record<string, GrupoCategoria>> = {
  'Mercado': 'variavel',
  'Comer fora': 'variavel',
  'Transporte': 'variavel',
  'Combustível': 'variavel',
  'Farmácia': 'variavel',
  'Beleza e cuidados': 'variavel',
  'Pets': 'variavel',

  'Contas de casa': 'fixo',
  'Assinaturas': 'fixo',
  'Educação': 'fixo',
  'Taxas e impostos': 'fixo',

  'Casa': 'eventual',
  'Saúde': 'eventual',
  'Vestuário': 'eventual',
  'Lazer': 'eventual',
  'Presentes': 'eventual',
  'Outros': 'eventual',
};

/**
 * Categoria que o usuario criou (ou de um app antigo) cai em `variavel`.
 *
 * A escolha e deliberada: subestimar gasto deixa a previsao otimista, e numa
 * decisao de compra o erro otimista e o pior dos dois.
 */
export const GRUPO_PADRAO: GrupoCategoria = 'variavel';

export function grupoDaCategoria(categoria: string): GrupoCategoria {
  return GRUPO_DA_CATEGORIA[categoria] ?? GRUPO_PADRAO;
}

export const FORMAS_PAGAMENTO = ['Débito', 'Crédito', 'Pix', 'Dinheiro', 'Vale'] as const;

export const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct'] as const;

export const ORIGENS_RENDA = [
  'Salário',
  'Benefício',
  'Vale',
  'Freelance',
  'Venda',
  'Reembolso',
  'Outros',
] as const;

export const TIPOS_CONTA = [
  { valor: 'corrente', rotulo: 'Conta corrente' },
  { valor: 'credito', rotulo: 'Cartão de crédito' },
  { valor: 'vale', rotulo: 'Vale' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
] as const;

export const TIPOS_DIVIDA = [
  { valor: 'emprestimo', rotulo: 'Empréstimo' },
  { valor: 'financiamento', rotulo: 'Financiamento' },
] as const;

export const PERIODICIDADES = [
  { valor: 'unica', rotulo: 'Uma vez' },
  { valor: 'mensal', rotulo: 'Todo mês' },
  { valor: 'anual', rotulo: 'Uma vez por ano' },
] as const;

/**
 * Quais formas de pagamento combinam com qual tipo de conta.
 *
 * Serve para a tela so oferecer contas que fazem sentido: escolher "Pix" nao
 * pode sugerir o cartao de credito.
 */
export const CONTAS_POR_FORMA: Readonly<Record<string, readonly string[]>> = {
  'Débito': ['corrente'],
  'Pix': ['corrente'],
  'Crédito': ['credito'],
  'Dinheiro': ['dinheiro'],
  'Vale': ['vale'],
};

export const CATEGORIA_PADRAO: string = CATEGORIAS[0];
export const FORMA_PAGAMENTO_PADRAO: string = FORMAS_PAGAMENTO[0];
export const UNIDADE_PADRAO: string = UNIDADES[0];
export const ORIGEM_RENDA_PADRAO: string = ORIGENS_RENDA[0];
