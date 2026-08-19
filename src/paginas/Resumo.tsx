/**
 * O resumo do mes: quanto saiu, em que, como foi pago e o que a IA acha disso.
 *
 * As contas sao feitas no aparelho, a partir do banco local — abrem na hora e
 * funcionam sem internet. So o botao de dicas fala com o servidor, e quando a
 * chave da Anthropic nao esta configurada ele nem aparece: a IA e um extra, e
 * o resumo tem que valer sozinho.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listarCompras } from '../dados/compras';
import { mesesComCompras, resumirMes, type FatiaResumo } from '../lib/resumo';
import { formatarReais } from '../lib/dinheiro';
import { mesAtual, nomeMes } from '../lib/datas';
import { pedirDicas, type Dicas } from '../dados/api';
import { useApp } from '../estado';

export function Resumo() {
  const navegar = useNavigate();
  const { iaLigada, offline } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);

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

  const meses = mesesComCompras(compras);
  const mes = mesEscolhido ?? meses[0] ?? mesAtual();
  const resumo = resumirMes(compras, mes);

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

      {!iaLigada && (
        <p className="dica">
          As dicas estão desligadas: falta configurar a chave da Anthropic no servidor.
          O resumo acima continua funcionando normalmente.
        </p>
      )}

      {iaLigada && (
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
