/**
 * O resumo do mes: quanto saiu, em que, como foi pago e o que a IA acha disso.
 *
 * As contas sao feitas no aparelho, a partir do banco local — abrem na hora e
 * funcionam sem internet. So o botao de dicas fala com o servidor.
 *
 * O BLOCO DE CAIXA no topo separa "saiu do caixa" de "no crédito", e essa
 * separacao e a explicacao visual da regra que impede a contagem dupla: compra
 * no credito nao tirou dinheiro de lugar nenhum ainda; quem tira e a fatura.
 *
 * A LINHA DE PONTE existe porque o Resumo e a Carteira contam diferente de
 * proposito: aqui uma geladeira de R$ 1.200 conta R$ 1.200 no mes da compra (foi
 * o que voce comprou), e la ela pesa R$ 100 por mes (e o que sai do caixa). Sem
 * dizer isso em voz alta, a diferenca entre as duas telas pareceria erro.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listarCompras } from '../dados/compras';
import { useFinanceiro } from '../dados/financeiro';
import { mesesComCompras, resumirMes, type FatiaResumo } from '../lib/resumo';
import { resumoDoMes } from '../../compartilhado/carteira';
import { limitesDo } from '../../compartilhado/planos';
import { formatarReais } from '../lib/dinheiro';
import { mesAtual, nomeMes } from '../lib/datas';
import { pedirDicas, type Dicas } from '../dados/api';
import { useApp } from '../estado';

export function Resumo() {
  const navegar = useNavigate();
  const { iaLigada, offline, plano } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const financeiro = useFinanceiro();

  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [dicas, setDicas] = useState<Dicas | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroDicas, setErroDicas] = useState<string | null>(null);

  if (compras === undefined) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const limites = limitesDo(plano);
  const meses = mesesComCompras(compras);
  const mes = mesEscolhido ?? meses[0] ?? mesAtual();
  const resumo = resumirMes(compras, mes);
  const caixa = financeiro.mostrar ? resumoDoMes(financeiro.dados, mes, Date.now()) : null;

  async function analisar() {
    setAnalisando(true);
    setErroDicas(null);
    setDicas(null);
    try {
      setDicas(await pedirDicas(mes));
    } catch (falha) {
      setErroDicas(falha instanceof Error ? falha.message : 'Não foi possível analisar.');
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Resumo</h1>
        </div>
      </header>

      {meses.length > 1 && (
        <div className="campo">
          <label className="campo-rotulo" htmlFor="mes">Mês</label>
          <select
            id="mes"
            className="entrada"
            value={mes}
            onChange={(e) => {
              setMesEscolhido(e.target.value);
              setDicas(null);
              setErroDicas(null);
            }}
          >
            {meses.map((chave) => (
              <option key={chave} value={chave}>{nomeMes(chave)}</option>
            ))}
          </select>
        </div>
      )}

      <section className="cartao">
        <span className="campo-rotulo">{nomeMes(mes)}</span>
        <div className="total-grande">{formatarReais(resumo.total)}</div>
        <p className="dica">
          {resumo.quantidade} compra(s) · média de {formatarReais(resumo.media)}
        </p>
        {resumo.variacao !== null && resumo.totalAnterior !== null && (
          <p className={'dica ' + (resumo.variacao > 0 ? 'subiu' : 'caiu')}>
            {resumo.variacao > 0 ? '▲' : '▼'} {formatarReais(Math.abs(resumo.variacao))} em
            relação ao mês anterior ({formatarReais(resumo.totalAnterior)})
          </p>
        )}
      </section>

      {caixa && financeiro.temRenda && (
        <section className="cartao">
          <div className="fatia-linha">
            <span>Entrou</span>
            <strong>{formatarReais(caixa.entradas)}</strong>
          </div>
          <div className="fatia-linha">
            <span>Saiu do caixa</span>
            <span>{formatarReais(caixa.saidasAVista + caixa.pagamentos)}</span>
          </div>
          <div className="fatia-linha">
            <span>
              No crédito <span className="dica">(vira fatura)</span>
            </span>
            <span>{formatarReais(caixa.noCredito)}</span>
          </div>
          {caixa.noVale > 0 && (
            <div className="fatia-linha">
              <span>No vale</span>
              <span>{formatarReais(caixa.noVale)}</span>
            </div>
          )}
          <div className="fatia-linha" style={{ marginTop: 8 }}>
            <span>Sobra</span>
            <strong className={caixa.sobra < 0 ? 'subiu' : 'caiu'}>
              {formatarReais(caixa.sobra)}
            </strong>
          </div>

          {caixa.adiadoEmParcelas > 0 && (
            <p className="dica" style={{ marginTop: 10 }}>
              Do total acima, {formatarReais(caixa.adiadoEmParcelas)} viram parcela de meses
              seguintes — por isso este número e o da Carteira não batem, e nenhum dos dois está
              errado.
            </p>
          )}
        </section>
      )}

      {resumo.quantidade === 0 && <p className="vazio">Nenhuma compra neste mês.</p>}

      {resumo.porCategoria.length > 0 && (
        <>
          <h2 className="secao-titulo">Por categoria</h2>
          <div className="cartao">{resumo.porCategoria.map(fatia)}</div>
        </>
      )}

      {resumo.porFormaPagamento.length > 0 && (
        <>
          <h2 className="secao-titulo">Por forma de pagamento</h2>
          <div className="cartao">{resumo.porFormaPagamento.map(fatia)}</div>
        </>
      )}

      <h2 className="secao-titulo">Dicas de economia</h2>

      {!limites.ia && <ExemploDeAnalise />}

      {limites.ia && !iaLigada && (
        <p className="dica">
          As dicas estão indisponíveis no momento: falta configurar a chave da Anthropic no
          servidor. O resumo acima continua funcionando normalmente.
        </p>
      )}

      {limites.ia && iaLigada && (
        <>
          <button
            type="button"
            className="botao botao-largo"
            disabled={analisando || resumo.quantidade === 0 || offline}
            onClick={analisar}
          >
            {analisando ? 'Analisando o mês…' : 'Analisar ' + nomeMes(mes)}
          </button>
          {offline && <p className="dica">Precisa de internet para analisar.</p>}
        </>
      )}

      {erroDicas && <p className="aviso aviso-erro" style={{ marginTop: 12 }}>{erroDicas}</p>}

      {dicas && (
        <div style={{ marginTop: 12 }}>
          <div className="cartao">{dicas.resumo}</div>

          {dicas.achados.map((achado, indice) => (
            <div className="cartao" key={indice}>
              <strong>{achado.titulo}</strong>
              <p className="dica" style={{ color: 'var(--texto)' }}>{achado.detalhe}</p>
              {achado.economiaEstimadaCentavos !== null && achado.economiaEstimadaCentavos > 0 && (
                <span className="selo selo-pendente">
                  economia estimada {formatarReais(achado.economiaEstimadaCentavos)}/mês
                </span>
              )}
            </div>
          ))}

          {dicas.previsao && (
            <div className="cartao">
              <strong>Daqui para frente</strong>
              <p className="dica" style={{ color: 'var(--texto)' }}>{dicas.previsao}</p>
            </div>
          )}

          {dicas.metas && (
            <div className="cartao">
              <strong>Suas metas</strong>
              <p className="dica" style={{ color: 'var(--texto)' }}>{dicas.metas}</p>
            </div>
          )}

          {dicas.sugestoes.length > 0 && (
            <div className="cartao">
              <strong>O que fazer</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {dicas.sugestoes.map((sugestao, indice) => (
                  <li key={indice}>{sugestao}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O exemplo estatico da analise, para o plano gratis.
 *
 * E texto fixo: NAO chama a API. Custa zero e mostra melhor o que o plano pago
 * entrega do que uma amostra que expira — e, num projeto que roda em free tier
 * permanente, esse custo zero e o que torna o exemplo possivel.
 */
function ExemploDeAnalise() {
  return (
    <>
      <p className="dica">
        <span className="selo selo-plano">plano pago</span> A análise lê o mês inteiro com os
        itens, compara com o anterior e olha os próximos doze meses. Um exemplo do que ela
        devolve:
      </p>
      <div className="cartao cartao-exemplo">
        <strong>Arroz subiu 20% em dois meses</strong>
        <p className="dica" style={{ color: 'var(--texto)' }}>
          O arroz de 5 kg passou de R$ 24,90 em julho para R$ 29,90 em agosto, e ele aparece em
          três das quatro compras de mercado do mês.
        </p>
        <span className="selo selo-pendente">economia estimada R$ 20,00/mês</span>
      </div>
      <div className="cartao cartao-exemplo">
        <strong>Daqui para frente</strong>
        <p className="dica" style={{ color: 'var(--texto)' }}>
          Com as parcelas já contratadas, dá para comprometer cerca de R$ 380 por mês sem
          estourar. O mês mais apertado é novembro, quando a fatura sobe por causa das parcelas
          da geladeira.
        </p>
      </div>
    </>
  );
}

function fatia(item: FatiaResumo) {
  return (
    <div className="fatia" key={item.nome}>
      <div className="fatia-linha">
        <span>{item.nome}</span>
        <span>
          {formatarReais(item.total)} · {item.percentual.toFixed(0)}%
        </span>
      </div>
      <div className="barra">
        <div className="barra-preenchida" style={{ width: item.percentual + '%' }} />
      </div>
    </div>
  );
}
