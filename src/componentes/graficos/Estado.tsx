/**
 * A forma de cada estado: circulo (cabe), triangulo (aperta), quadrado (estoura).
 *
 * Estado nunca e so cor: cerca de 1 em cada 12 homens confunde verde com
 * vermelho, e o app e usado sob a luz do mercado. A forma vai junto da cor e do
 * nome, em todo lugar onde o estado aparece. As tres formas sao as da filosofia
 * visual do projeto.
 */

import type { EstadoDaBarra } from '../../lib/series';

export const NOME_DO_ESTADO: Record<EstadoDaBarra, string> = {
  cabe: 'Cabe',
  aperta: 'Aperta',
  estoura: 'Estoura',
};

/** A forma, em tamanho de texto, herdando a cor do contexto (`currentColor`). */
export function FormaDeEstado({ estado, tamanho = 12 }: { estado: EstadoDaBarra; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {estado === 'cabe' && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {estado === 'aperta' && <path d="M6 1 11 11H1Z" fill="currentColor" />}
      {estado === 'estoura' && <rect x="1" y="1" width="10" height="10" fill="currentColor" />}
    </svg>
  );
}

/** Forma e nome, sobre o preenchimento do proprio estado. */
export function SeloDeEstado({ estado }: { estado: EstadoDaBarra }) {
  return (
    <span className={'selo-estado selo-estado-' + estado}>
      <FormaDeEstado estado={estado} />
      {NOME_DO_ESTADO[estado]}
    </span>
  );
}

/**
 * O marcador de um ponto, DENTRO de um SVG, centrado em `(x, y)`.
 *
 * O contorno na cor da tinta e o que separa o ponto da linha e do fundo nos dois
 * temas; o preenchimento e o do estado.
 */
export function MarcadorDeEstado({
  estado,
  x,
  y,
  raio = 6,
}: {
  estado: EstadoDaBarra;
  x: number;
  y: number;
  raio?: number;
}) {
  const classe = 'gr-foco gr-contorno gr-' + estado;
  if (estado === 'cabe') return <circle className={classe} cx={x} cy={y} r={raio} />;
  if (estado === 'estoura') {
    return <rect className={classe} x={x - raio + 0.5} y={y - raio + 0.5} width={(raio - 0.5) * 2} height={(raio - 0.5) * 2} />;
  }
  const alto = raio + 1.5;
  return (
    <path
      className={classe}
      d={`M${x} ${y - alto} L${x + alto} ${y + raio - 0.5} L${x - alto} ${y + raio - 0.5}Z`}
      strokeLinejoin="miter"
    />
  );
}
