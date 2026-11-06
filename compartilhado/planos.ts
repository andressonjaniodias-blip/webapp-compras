/**
 * O que cada plano libera. Uma constante por recurso, num arquivo so.
 *
 * Existe isolado para que nunca apareça um `if (plano === 'pago')` espalhado
 * pelas telas: e assim que um recurso acaba liberado num lugar e travado noutro,
 * e o usuario descobre a inconsistencia antes de voce.
 *
 * Uma honestidade que vale escrever: **so a IA e barrada de verdade**, no
 * servidor, porque e a unica coisa que custa dinheiro por uso. Todo o resto aqui
 * e porteira de tela, e quem editar o armazenamento do navegador contorna. Isso
 * e aceito de proposito: blindar a previsao exigiria calcular no servidor, e
 * isso quebraria a decisao fundadora do projeto — o app tem que funcionar sem
 * sinal, no corredor do mercado, que e onde ele mais serve.
 */

export type Plano = 'gratis' | 'pago';

export interface Limites {
  /** Ate quantos meses a projecao vai. */
  mesesDePrevisao: number;
  /** Quantas metas podem existir ao mesmo tempo. */
  metas: number;
  /**
   * `false` = o simulador responde so pelo mes atual e diz, sem numeros, com
   * quantos apertos futuros a compra cruza. Mostrar que existe resposta e
   * esconder o numero e desejo honesto: o calculo e real.
   */
  simuladorCompleto: boolean;
  exportarXlsx: boolean;
  /** A unica trava que vale dinheiro, e a unica aplicada no servidor. */
  ia: boolean;
}

export const LIMITES: Readonly<Record<Plano, Limites>> = {
  gratis: {
    mesesDePrevisao: 3,
    metas: 1,
    simuladorCompleto: false,
    exportarXlsx: false,
    ia: false,
  },
  pago: {
    mesesDePrevisao: 12,
    metas: 20,
    simuladorCompleto: true,
    exportarXlsx: true,
    ia: true,
  },
};

export function limitesDo(plano: Plano): Limites {
  return LIMITES[plano] ?? LIMITES.gratis;
}

/** Aceita so os dois valores conhecidos; qualquer outra coisa vira 'gratis'. */
export function planoValido(valor: unknown): Plano {
  return valor === 'pago' ? 'pago' : 'gratis';
}

