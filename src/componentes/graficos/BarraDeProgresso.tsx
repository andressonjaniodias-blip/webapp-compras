/**
 * Quanto ja foi: uma barra de progresso neutra (sem estado), para metas, dividas e
 * as fatias do resumo.
 *
 * Existe para substituir quatro copias de `.barra` espalhadas em JSX. Com
 * `segmentos`, a barra vira uma fileira de quadrados, um por parcela: num
 * emprestimo de 12 parcelas, "3 de 12 pagas" se le sem ler. Acima de
 * `LIMITE_DE_SEGMENTOS` (um financiamento de 360 parcelas) os quadrados virariam
 * poeira, e a barra volta a ser continua.
 *
 * Nao e uma barra de ESTADO (`BarraEstado`): aqui nao ha "cabe" nem "estoura", so
 * quanto falta. O trilho continua sendo a regua tracejada.
 */

const LARGURA = 300;
const LIMITE_DE_SEGMENTOS = 36;
const FOLGA = 3;

export function BarraDeProgresso({
  progresso,
  segmentos,
  rotulo,
}: {
  /** De 0 a 1. */
  progresso: number;
  /** Uma casa por parcela. Ignorado acima de `LIMITE_DE_SEGMENTOS`. */
  segmentos?: { total: number; feitos: number };
  /** O que a barra diz, para leitor de tela. */
  rotulo: string;
}) {
  const fracao = Math.min(1, Math.max(0, Number.isFinite(progresso) ? progresso : 0));
  const emCasas = segmentos !== undefined && segmentos.total > 1 && segmentos.total <= LIMITE_DE_SEGMENTOS;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} 14`}
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fracao * 100)}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {emCasas && segmentos ? (
        Array.from({ length: segmentos.total }, (_, i) => {
          const largura = (LARGURA - (segmentos.total - 1) * FOLGA) / segmentos.total;
          const x = i * (largura + FOLGA);
          return (
            <rect
              key={i}
              className={i < segmentos.feitos ? 'gr-contorno gr-acento' : 'gr-futuro'}
              x={x + 0.75}
              y="1.75"
              width={Math.max(0, largura - 1.5)}
              height="10.5"
            />
          );
        })
      ) : (
        <>
          <line className="gr-regua" x1="0" y1="7" x2={LARGURA} y2="7" />
          {fracao > 0 && (
            <rect
              className="gr-contorno gr-acento"
              x="0.75"
              y="1.75"
              width={Math.max(2, fracao * LARGURA - 1.5)}
              height="10.5"
            />
          )}
        </>
      )}
    </svg>
  );
}
