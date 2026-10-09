/**
 * Uma linha curta, sem eixo e sem rotulo: so a forma de como um valor andou.
 *
 * Serve a cartao do painel e a linha de preco. O ponto final e o valor de agora,
 * e carrega o tom: subiu, caiu ou neutro. O tom e cor SO no ponto; quem diz se
 * subiu ou caiu, por escrito, e o texto ao lado (o `rotulo` vira o aria-label).
 */

import { escalaLinear } from './escala';

export type Tom = 'sobe' | 'cai' | 'neutro';

const CLASSE_DO_TOM: Record<Tom, string> = {
  sobe: 'gr-estoura',
  cai: 'gr-cabe',
  neutro: 'gr-serie-1',
};

export function Sparkline({
  valores,
  rotulo,
  tom = 'neutro',
  largura = 92,
  altura = 32,
}: {
  valores: readonly number[];
  /** O que a linha diz, para leitor de tela. */
  rotulo: string;
  tom?: Tom;
  largura?: number;
  altura?: number;
}) {
  if (valores.length < 2) return null;

  const margem = 6;
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const x = escalaLinear(0, valores.length - 1, margem, largura - margem);
  const y = escalaLinear(menor, maior, altura - margem, margem);

  const pontos = valores.map((v, i) => [x(i), y(v)] as const);
  const caminho = pontos
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`)
    .join('');
  const [ultimoX, ultimoY] = pontos[pontos.length - 1]!;

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label={rotulo}
      style={{ flex: 'none', overflow: 'visible' }}
    >
      <path className="gr-linha" d={caminho} />
      <circle className={'gr-contorno ' + CLASSE_DO_TOM[tom]} cx={ultimoX} cy={ultimoY} r="4.5" />
    </svg>
  );
}
