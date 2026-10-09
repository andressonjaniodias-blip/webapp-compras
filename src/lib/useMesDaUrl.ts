/**
 * O mes que uma lista mostra, guardado na URL (`?mes=2026-09`).
 *
 * Na URL, e nao em estado da tela, para que abrir uma compra e voltar devolva a
 * pessoa ao MESMO mes: com estado local a lista remontava no mes corrente e quem
 * estava conferindo setembro tinha de navegar de novo. O mes corrente e o padrao
 * e nao aparece na URL.
 *
 * Um `mes` que nao esta na lista (link velho, mes que ficou vazio) cai no
 * corrente em vez de mostrar uma tela sem nada.
 */

import { useSearchParams } from 'react-router-dom';
import { chaveMes } from './datas';

export function useMesDaUrl(meses: readonly string[]): [string, (mes: string) => void] {
  const [params, setParams] = useSearchParams();
  const corrente = chaveMes(Date.now());
  const pedido = params.get('mes');

  const mes =
    pedido !== null && meses.includes(pedido)
      ? pedido
      : meses.includes(corrente)
        ? corrente
        : (meses[0] ?? corrente);

  function trocar(novo: string) {
    const proximos = new URLSearchParams(params);
    if (novo === corrente) proximos.delete('mes');
    else proximos.set('mes', novo);
    setParams(proximos, { replace: true });
  }

  return [mes, trocar];
}
