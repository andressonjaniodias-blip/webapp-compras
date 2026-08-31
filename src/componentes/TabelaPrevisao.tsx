/**
 * A previsao mes a mes.
 *
 * As colunas separam **comprometido** de **estimado** de proposito: o primeiro e
 * certo (parcelas ja contratadas e reserva de meta), o segundo e palpite (media
 * do que voce costuma gastar). Juntar os dois numa coluna so faria a previsao
 * parecer mais precisa do que e, e previsao cuja premissa nao da para ver nao e
 * usada duas vezes.
 *
 * No plano gratis, as linhas alem do horizonte aparecem com os valores ocultos —
 * mas o mes critico continua sendo NOMEADO. Voce fica sabendo que existe um
 * aperto e nao sabe o tamanho dele. O calculo e real: nao ha escassez inventada
 * aqui, so um numero nao lido.
 */

import type { LinhaPrevisao } from '../../compartilhado/previsao';
import { formatarReais } from '../lib/dinheiro';
import { nomeMes } from '../lib/datas';

interface Props {
  linhas: readonly LinhaPrevisao[];
  /** Quantas linhas mostram valores. As demais vem atenuadas. */
  visiveis: number;
  /** A linha de menor saldo acumulado, para ser nomeada mesmo quando oculta. */
  maisApertado: LinhaPrevisao | null;
}

export function TabelaPrevisao({ linhas, visiveis, maisApertado }: Props) {
  const ocultas = Math.max(0, linhas.length - visiveis);

  return (
    <>
      <div className="rolagem">
        <table className="previsao">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Entra</th>
              <th>Comprometido</th>
              <th>Estimado</th>
              <th>Sobra</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, indice) => {
              const visivel = indice < visiveis;
              const comprometido = linha.comprometido + linha.reservaMetas;

              return (
                <tr
                  key={linha.mes}
                  className={
                    (visivel ? '' : 'previsao-oculta ') +
                    (maisApertado?.mes === linha.mes ? 'previsao-apertado' : '')
                  }
                >
                  <th scope="row">
                    {nomeMes(linha.mes).slice(0, 3)}
                    {linha.mes.startsWith(String(new Date().getFullYear())) ? '' : `/${linha.mes.slice(2, 4)}`}
                    {linha.parcial && <span className="previsao-parcial"> (resta)</span>}
                  </th>
                  {visivel ? (
                    <>
                      <td>{formatarReais(linha.entradas)}</td>
                      <td>{comprometido > 0 ? formatarReais(comprometido) : '—'}</td>
                      <td>{formatarReais(linha.estimado)}</td>
                      <td className={linha.sobra < 0 ? 'subiu' : ''}>{formatarReais(linha.sobra)}</td>
                      <td className={linha.saldoAcumulado < 0 ? 'subiu' : ''}>
                        {formatarReais(linha.saldoAcumulado)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="previsao-borrado">
                      ▪▪▪▪▪
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ocultas > 0 && (
        <p className="dica">
          <span className="selo selo-plano">plano pago</span> Os próximos {ocultas} meses estão
          calculados
          {maisApertado && !linhas.slice(0, visiveis).some((l) => l.mes === maisApertado.mes) ? (
            <>
              {' '}
              — e o aperto está em <strong>{nomeMes(maisApertado.mes)}</strong>.
            </>
          ) : (
            '.'
          )}
        </p>
      )}
    </>
  );
}
