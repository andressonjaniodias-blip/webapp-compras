/**
 * Listas fixas que aparecem como botoes na tela. Ficam aqui, e nao no banco,
 * porque sao poucas e mudam raramente — e porque um seletor com opcao fixa e
 * mais rapido de tocar no corredor do mercado do que um campo de texto.
 *
 * Nao ha "outra": qualquer valor gravado antes continua valendo mesmo que suma
 * daqui, porque o campo e texto no banco.
 */

export const CATEGORIAS = [
  'Mercado',
  'Farmácia',
  'Combustível',
  'Restaurante',
  'Transporte',
  'Casa',
  'Lazer',
  'Vestuário',
  'Saúde',
  'Outros',
] as const;

export const FORMAS_PAGAMENTO = ['Débito', 'Crédito', 'Pix', 'Dinheiro', 'Vale'] as const;

export const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct'] as const;

export const CATEGORIA_PADRAO: string = CATEGORIAS[0];
export const FORMA_PAGAMENTO_PADRAO: string = FORMAS_PAGAMENTO[0];
export const UNIDADE_PADRAO: string = UNIDADES[0];
