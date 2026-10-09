/**
 * As receitas: o dinheiro que entrou, lancamento a lancamento, um mes por vez.
 *
 * ENTRADA E LANCAMENTO, nao regra. A recorrencia foi abandonada — ninguem quer
 * cadastrar "salario, todo dia 5" para depois ve-lo virar datas —, entao quem
 * lanca anota o que caiu, na data em que caiu. O que vai entrar nos meses que
 * vem a previsao estima pela media (`estimarEntradaMensal`), e a Carteira mostra
 * e deixa corrigir essa estimativa.
 *
 * No mesmo padrao das compras: a lista e so lista, tocar numa linha abre a tela
 * da entrada (`EditarReceita`), o "‹" volta para ca, e o mes escolhido vive na
 * URL para voltar ao mesmo mes. O total do mes e o "Entrou" do Resumo — a mesma
 * conta, `entradasDeCaixaEntre`, com o vale fora.
 */

import { useNavigate } from 'react-router-dom';
import { criarRenda } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { ORIGENS_RENDA } from '../../compartilhado/constantes';
import { resumoDoMes } from '../../compartilhado/carteira';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, formatarData, mesesDaLista, nomeMes } from '../lib/datas';
import { useMesDaUrl } from '../lib/useMesDaUrl';
import { useVoltar } from '../lib/useVoltar';
import { useApp } from '../estado';
import { NavegadorDeMes } from '../componentes/NavegadorDeMes';

export function Receitas() {
  const navegar = useNavigate();
  const voltar = useVoltar('/');
  const { atualizarPendentes } = useApp();
  const { dados, carregando } = useFinanceiro();

  const agora = Date.now();
  const meses = mesesDaLista(
    dados.rendas.map((r) => chaveMes(r.data)),
    agora,
  );
  const [mes, escolherMes] = useMesDaUrl(meses);
  const doMes = dados.rendas.filter((r) => chaveMes(r.data) === mes);
  const apelidos = new Map(dados.contas.map((c) => [c.id, c.apelido]));

  async function nova() {
    const id = await criarRenda({ origem: ORIGENS_RENDA[0] });
    await atualizarPendentes();
    navegar('/receita/' + id);
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Receitas</h1>
        </div>
      </header>

      {carregando && <p className="carregando">Carregando…</p>}

      {!carregando && (
        <>
          <NavegadorDeMes meses={meses} mes={mes} onChange={escolherMes} />

          {/* O "Entrou" do Resumo: a mesma conta, so o que ja caiu em conta. */}
          <div className="mes-total">
            <span>Entrou em {nomeMes(mes).split(' ')[0]}</span>
            <span>{formatarReais(resumoDoMes(dados, mes, agora).entradas)}</span>
          </div>

          {doMes.length === 0 && (
            <p className="vazio">
              Nenhuma entrada em {nomeMes(mes).split(' ')[0]}.
              <br />
              Lance o que cair — salário, um extra, um reembolso. Com alguns meses lançados o app
              estima quanto costuma entrar.
            </p>
          )}

          <ul className="lista">
            {doMes.map((renda) => {
              const conta = renda.contaId ? apelidos.get(renda.contaId) : undefined;
              return (
                <li key={renda.id}>
                  <button
                    type="button"
                    className="compra"
                    onClick={() => navegar('/receita/' + renda.id)}
                  >
                    <div className="compra-corpo">
                      <div className="compra-titulo">
                        {renda.origem || renda.descricao || 'Entrada'}
                      </div>
                      <div className="compra-meta">
                        {formatarData(renda.data)}
                        {renda.contaId && ` · cai em ${conta ?? 'outra conta'}`}
                        {renda.data > agora && ' · ainda não caiu'}
                      </div>
                    </div>
                    <span className="compra-valor">{formatarReais(renda.valor)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Nova entrada
        </button>
      </div>
    </div>
  );
}
