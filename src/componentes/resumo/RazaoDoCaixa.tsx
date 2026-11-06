/**
 * O razao do caixa do mes e a linha de valor que ele (e o Resumo) usam.
 *
 * Saiu de `paginas/Resumo.tsx`, que passava de 690 linhas: a pagina fica com o fluxo, e
 * aqui so se desenha. Cada numero vem de `resumoDoMes` (invariante 9).
 */

import { type MesFinanceiro } from '../../../compartilhado/carteira';
import { formatarReais } from '../../lib/dinheiro';
import { apenasMes } from '../../lib/datas';

/**
 * O fechamento de caixa, como subtracao conferivel.
 *
 * Cada linha e guardada pelo SEU dado, e nao o cartao inteiro por `temRenda`.
 * Antes o bloco todo exigia renda cadastrada, e quem tinha contas e cartoes sem
 * renda nao via nem "saiu do caixa" — mas o Princípio 0 diz que numero vem de
 * DADO, e o dado de "saiu do caixa" e compra mais conta, que existiam.
 *
 * `aVencer` fica FORA da subtracao, embaixo da regua: ele e o que vence e ainda
 * nao foi pago, ou seja, dinheiro que continua na conta. Some-lo a sobra era o
 * bug que fazia o mes passado de quem registra pagamento parcial parecer PIOR
 * que o de quem nunca registrou nada.
 *
 * O VALE fica fora dos dois lados: a recarga nao e "Entrou" e a compra feita
 * com ele nao e saida, porque vale nao paga fatura. So o que a conta manda para
 * ele tem linha na subtracao. A frase no fim do cartao diz para onde foi o
 * numero que a pessoa esperava ver em "Entrou".
 */
export function RazaoDoCaixa({
  caixa,
  ehCorrente,
  temRenda,
}: {
  caixa: MesFinanceiro;
  ehCorrente: boolean;
  temRenda: boolean;
}) {
  const temSaida =
    caixa.saidasAVista > 0 ||
    caixa.pagamentos > 0 ||
    caixa.descontoEmFolha > 0 ||
    caixa.enviadoAoVale > 0;
  if (!temRenda && !temSaida) return null;

  return (
    <>
      <h2 className="secao-titulo">O que saiu do meu dinheiro</h2>
      <section className="cartao">
        {temRenda && <Linha rotulo="Entrou" valor={caixa.entradas} />}
        {caixa.saidasAVista > 0 && (
          <Linha sinal="−" rotulo="Compras à vista, débito ou Pix" valor={caixa.saidasAVista} />
        )}
        {caixa.pagamentos > 0 && (
          <Linha sinal="−" rotulo="Faturas e parcelas pagas" valor={caixa.pagamentos} />
        )}
        {caixa.descontoEmFolha > 0 && (
          <Linha sinal="−" rotulo="Descontado em folha" valor={caixa.descontoEmFolha} />
        )}
        {caixa.enviadoAoVale > 0 && (
          <Linha sinal="−" rotulo="Enviado para o vale" valor={caixa.enviadoAoVale} />
        )}

        {temRenda && (
          <>
            <hr className="razao-regua" />
            <div className="razao-linha razao-total">
              <span>=</span>
              <span>{ehCorrente ? 'Sobra até agora' : 'Sobrou em ' + apenasMes(caixa.mes)}</span>
              <span className={'razao-valor ' + (caixa.sobra < 0 ? 'valor-ruim' : 'valor-bom')}>
                {formatarReais(caixa.sobra)}
              </span>
            </div>
          </>
        )}

        {caixa.aVencer > 0 && (
          <>
            <hr className="razao-regua" />
            <Linha
              rotulo={ehCorrente ? 'Ainda vence neste mês' : 'Ficou em aberto'}
              valor={caixa.aVencer}
            />
            <p className="dica">
              {ehCorrente
                ? 'Esse dinheiro ainda está na conta, então não entra na subtração acima.'
                : 'Não foi pago, então não saiu da conta — fica fora da subtração acima.'}
            </p>
          </>
        )}

        {caixa.presumido && (
          <p className="dica">
            Competências vencidas sem pagamento registrado contam como pagas por presunção. Se
            algo ficou no rotativo, registre o pagamento real para o número refletir isso.
          </p>
        )}

        {caixa.noCredito > 0 && (
          <p className="dica">
            Os {formatarReais(caixa.noCredito)} comprados no crédito não aparecem aqui de
            propósito: no mês da compra eles não saíram de conta nenhuma.
          </p>
        )}

        {(caixa.entradasNoVale > 0 || caixa.noVale > 0) && (
          <p className="dica">
            O vale fica fora desta conta:{' '}
            {caixa.entradasNoVale > 0 && <>entraram {formatarReais(caixa.entradasNoVale)} nele</>}
            {caixa.entradasNoVale > 0 && caixa.noVale > 0 && ' e '}
            {caixa.noVale > 0 && <>{formatarReais(caixa.noVale)} foram gastos com ele</>}. Ele só
            compra comida, então não paga fatura nem vira dinheiro.
          </p>
        )}
      </section>
    </>
  );
}

/** Uma linha do razao. O sinal em coluna propria faz a subtracao ser legivel. */
export function Linha({
  sinal,
  rotulo,
  dica,
  valor,
  filha,
}: {
  sinal?: string;
  rotulo: string;
  dica?: string;
  valor: number;
  filha?: boolean;
}) {
  return (
    <div className={'razao-linha' + (filha ? ' razao-linha-filha' : '')}>
      <span className="razao-sinal">{sinal ?? ''}</span>
      <span>
        {rotulo}
        {dica !== undefined && <span className="dica"> {dica}</span>}
      </span>
      <span className="razao-valor">{formatarReais(valor)}</span>
    </div>
  );
}
