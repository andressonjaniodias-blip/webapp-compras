/**
 * "Posso comprar isto?" — a tela que justifica o resto do projeto.
 *
 * Voce poe o valor e a forma de pagamento, e ela responde com a projecao ANTES e
 * DEPOIS da compra: em que fatura cai, quantos dias ha ate pagar, qual mes fica
 * apertado e se algum fica negativo.
 *
 * Ela NAO GRAVA NADA. E calculo puro sobre a projecao, e sai da tela sem deixar
 * rastro — e isso que permite usa-la na frente da prateleira sem medo de sujar o
 * historico com uma compra que voce nem fez.
 *
 * O veredito compara duas projecoes feitas do mesmo jeito, entao qualquer viés
 * do modelo se cancela na comparacao: o "antes x depois" e mais confiavel do que
 * qualquer numero absoluto isolado.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { SeletorChips } from '../componentes/SeletorChips';
import { TabelaPrevisao } from '../componentes/TabelaPrevisao';
import { CATEGORIAS, CATEGORIA_PADRAO } from '../../compartilhado/constantes';
import { limitesDo } from '../../compartilhado/planos';
import {
  estimarGastoCorrente,
  mesesAteAMetaMaisLonga,
  simular,
  type Simulacao,
} from '../../compartilhado/previsao';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';

const HORIZONTE = 12;

export function Simular() {
  const navegar = useNavigate();
  const { plano } = useApp();
  const { dados, gastoManual, carregando, temRenda } = useFinanceiro();

  const [valor, setValor] = useState(0);
  const [contaId, setContaId] = useState<string>('');
  const [parcelas, setParcelas] = useState(1);
  const [categoria, setCategoria] = useState<string>(CATEGORIA_PADRAO);

  if (carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const limites = limitesDo(plano);
  const agora = Date.now();
  const meses = Math.max(HORIZONTE, mesesAteAMetaMaisLonga(dados.metas, agora));

  const estimativa = estimarGastoCorrente(dados, agora, gastoManual);
  const contaEscolhida = dados.contas.find((c) => c.id === contaId);
  const noCredito = contaEscolhida?.tipo === 'credito';

  const resultado: Simulacao | null =
    valor > 0
      ? simular(
          dados,
          { valor, contaId: contaId || null, parcelas: noCredito ? parcelas : 1, data: agora, categoria },
          { meses, agora, gastoManual },
        )
      : null;

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar(-1)}>
            ‹
          </button>
          <h1>Posso comprar?</h1>
        </div>
      </header>

      {!temRenda && (
        <p className="aviso aviso-atencao">
          Sem uma entrada cadastrada não há previsão para comparar.{' '}
          <button type="button" className="link" onClick={() => navegar('/rendas')}>
            Cadastrar entrada
          </button>
        </p>
      )}

      <div className="campo">
        <label className="campo-rotulo" htmlFor="quanto">Quanto custa</label>
        <CampoDinheiro id="quanto" valor={valor} onChange={setValor} />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="pagamento">Pagando com</label>
        <select
          id="pagamento"
          className="entrada"
          value={contaId}
          onChange={(e) => setContaId(e.target.value)}
        >
          <option value="">À vista, sem conta definida</option>
          {dados.contas.map((conta) => (
            <option key={conta.id} value={conta.id}>{conta.apelido}</option>
          ))}
        </select>
      </div>

      {noCredito && (
        <div className="campo">
          <label className="campo-rotulo" htmlFor="vezes">Em quantas vezes</label>
          <input
            id="vezes"
            className="entrada"
            type="number"
            min={1}
            max={48}
            inputMode="numeric"
            value={parcelas}
            onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      )}

      <div className="campo">
        <span className="campo-rotulo">Categoria</span>
        <SeletorChips
          opcoes={CATEGORIAS}
          valor={categoria}
          rotulo="Categoria"
          onChange={setCategoria}
        />
      </div>

      {resultado && (
        <>
          <Veredito
            resultado={resultado}
            completo={limites.simuladorCompleto}
            estimativaFraca={estimativa.fraca}
          />

          {resultado.faltaDeLimite > 0 && (
            <p className="aviso aviso-erro">
              <strong>Não cabe no limite deste cartão.</strong> Faltam{' '}
              {formatarReais(resultado.faltaDeLimite)} de limite disponível — a compra não
              passa, independentemente de caber no seu mês.
            </p>
          )}

          <div className="cartao">
            {resultado.parcelas > 1 && (
              <p style={{ marginTop: 0 }}>
                <strong>
                  {resultado.parcelas}x de {formatarReais(resultado.parcela)}
                </strong>
                {resultado.competenciaFinal && ` — pesando até ${nomeMes(resultado.competenciaFinal)}`}
              </p>
            )}
            {resultado.competenciaInicial && (
              <p className="dica" style={{ marginTop: 0 }}>
                Cai na fatura que vence em{' '}
                {formatarData(resultado.vencimentoEm ?? agora)} · você tem{' '}
                <strong>{resultado.diasAtePagar} dias</strong> para pagar.
              </p>
            )}
            {resultado.usoDoLimite !== null && resultado.faltaDeLimite === 0 && (
              <p className="dica">
                Passa a ocupar {Math.round(resultado.usoDoLimite * 100)}% do limite do cartão.
              </p>
            )}
            {resultado.metasAtrasadas.map((meta) => (
              <p className="dica subiu" key={meta.descricao}>
                Atrasa <strong>{meta.descricao}</strong> em{' '}
                {Number.isFinite(meta.atrasoEmMeses) ? `${meta.atrasoEmMeses} mês(es)` : 'tempo indefinido'}.
              </p>
            ))}
          </div>

          <h2 className="secao-titulo">Como ficam os próximos meses</h2>
          <TabelaPrevisao
            linhas={resultado.depois}
            visiveis={limites.simuladorCompleto ? resultado.depois.length : 1}
            maisApertado={resultado.mesMaisApertado}
          />

          <p className="dica">
            Nada disto é gravado. Feche a tela e o histórico continua igual.
          </p>
        </>
      )}

      {!resultado && (
        <p className="vazio">
          Digite o valor para ver se cabe.
          <br />O app compara a previsão de antes com a de depois da compra.
        </p>
      )}
    </div>
  );
}

/**
 * O veredito, com a premissa a vista.
 *
 * Quando o app ainda nao tem historico, o gasto corrente estimado e zero — e um
 * "cabe" apoiado em zero de gasto previsto e otimista demais para uma decisao de
 * compra. Dizer isso no proprio cartao do veredito e o que impede a resposta de
 * parecer mais segura do que e.
 */
function Veredito({
  resultado,
  completo,
  estimativaFraca,
}: {
  resultado: Simulacao;
  completo: boolean;
  estimativaFraca: boolean;
}) {
  const apertado = resultado.mesMaisApertado;
  const ressalva = estimativaFraca ? (
    <p className="veredito-ressalva">
      Ainda sem histórico de gastos suficiente: esta conta considera só o que já está
      contratado, e não o que você costuma gastar no mês.
    </p>
  ) : null;

  if (resultado.veredito === 'estoura') {
    const pior = resultado.mesesNegativos[0]!;
    return (
      <section className="veredito veredito-estoura">
        <strong>Estoura em {nomeMes(pior.mes)}</strong>
        <p>
          {completo
            ? `Faltam ${formatarReais(Math.abs(pior.saldoAcumulado))} para fechar o mês.`
            : 'O saldo fica negativo antes do fim do horizonte.'}
        </p>
        {ressalva}
      </section>
    );
  }

  if (resultado.veredito === 'aperta') {
    return (
      <section className="veredito veredito-aperta">
        <strong>Aperta{apertado ? ` em ${nomeMes(apertado.mes)}` : ''}</strong>
        <p>
          {completo && apertado
            ? `Sobram ${formatarReais(apertado.saldoAcumulado)} no mês mais magro.`
            : `Cabe neste mês, mas cruza com ${resultado.apertosNovos} aperto(s) mais à frente.`}
        </p>
        {ressalva}
      </section>
    );
  }

  return (
    <section className="veredito veredito-cabe">
      <strong>Cabe</strong>
      <p>
        {completo && apertado
          ? `Mesmo no mês mais magro sobram ${formatarReais(apertado.saldoAcumulado)}.`
          : 'Cabe neste mês.'}
      </p>
      {ressalva}
    </section>
  );
}
