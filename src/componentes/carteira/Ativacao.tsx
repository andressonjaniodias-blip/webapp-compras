/**
 * A porta de entrada do lado financeiro, quando ainda nao ha nada dentro. Saiu de
 * `paginas/Carteira.tsx`, que passava de 560 linhas.
 */

import { useNavigate } from 'react-router-dom';

/**
 * A porta de entrada do controle financeiro, quando ainda nao ha nada dentro.
 *
 * Existe porque a versao anterior escondia o modulo inteiro ate a primeira conta
 * existir — inclusive o caminho para criar essa primeira conta.
 *
 * Os dois estados sao separados de proposito. Num aparelho novo, "nao ha conta"
 * e "a conta ainda nao chegou da nuvem" parecem identicos daqui, e convidar a
 * cadastrar produziria um segundo "Nubank" que a sincronizacao duplicaria nos
 * dois aparelhos com toda a fidelidade. O aviso aparece, mas nao tranca nada:
 * quem esta comecando de verdade tambem nunca sincronizou, e travar os botoes
 * recriaria o beco sem saida que esta tela veio desfazer.
 */
export function Ativacao({
  nuncaSincronizou,
  sincronizando,
  onSincronizar,
}: {
  nuncaSincronizou: boolean;
  sincronizando: boolean;
  onSincronizar: () => void;
}) {
  const navegar = useNavigate();

  return (
    <div className="app" role="main">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Carteira</h1>
        </div>
      </header>

      <div className="cartao">
        <p className="sem-topo">
          Contas, cartões, faturas e a previsão dos próximos meses — para o app responder
          <strong> “posso comprar isto?”</strong> antes da compra.
        </p>
        <p className="dica">
          Ligar isto não muda em nada o registro de compras: ele continua exatamente como é.
        </p>
      </div>

      {nuncaSincronizou && (
        <div className="cartao">
          <p className="aviso aviso-atencao" style={{ margin: 0 }}>
            Este aparelho ainda não recebeu os dados da nuvem. Se você já cadastrou contas em
            outro aparelho, <strong>sincronize antes de cadastrar</strong> — senão a mesma conta
            passa a existir duas vezes.
          </p>
          <div className="acoes">
            <button
              type="button"
              className="botao botao-primario botao-largo"
              disabled={sincronizando}
              onClick={onSincronizar}
            >
              {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          </div>
        </div>
      )}

      <div className="cartao">
        <div className="acoes sem-topo">
          <button
            type="button"
            className="botao botao-primario botao-largo"
            onClick={() => navegar('/contas')}
          >
            Cadastrar conta ou cartão
          </button>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/receitas')}>
            Cadastrar uma entrada
          </button>
        </div>
        <p className="dica">
          Comece pela conta de onde o dinheiro sai. As entradas que você lança são o que faz o
          app projetar os próximos meses.
        </p>
      </div>
    </div>
  );
}
