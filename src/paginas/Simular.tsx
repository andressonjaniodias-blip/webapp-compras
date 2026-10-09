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
import { CampoNumero } from '../componentes/CampoNumero';
import { SeletorChips } from '../componentes/SeletorChips';
import { TabelaPrevisao } from '../componentes/TabelaPrevisao';
import { LinhaSaldo } from '../componentes/graficos/LinhaSaldo';
import { CATEGORIAS, CATEGORIA_PADRAO } from '../../compartilhado/constantes';
import { limitesDo } from '../../compartilhado/planos';
import {
  estimarGastoCorrente,
  folgaDe,
  mesesAteAMetaMaisLonga,
  simular,
  type Simulacao,
  estimarEntradaMensal,
  temBaseDeEntrada,
} from '../../compartilhado/previsao';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';

const HORIZONTE = 12;

export function Simular() {
  const navegar = useNavigate();
  const { plano } = useApp();
  const { dados, gastoManual, entradaManual, carregando } = useFinanceiro();

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
  const temBase = temBaseDeEntrada(estimarEntradaMensal(dados, agora, entradaManual));
  const contaEscolhida = dados.contas.find((c) => c.id === contaId);
  const noCredito = contaEscolhida?.tipo === 'credito';

  const resultado: Simulacao | null =
    valor > 0
      ? simular(
          dados,
          { valor, contaId: contaId || null, parcelas: noCredito ? parcelas : 1, data: agora, categoria },
          { meses, agora, gastoManual, entradaManual },
        )
      : null;

  // O que o plano deixa ler. O grafico so existe a partir de dois meses: um ponto
  // sozinho nao e trajetoria, e a caixa vazia dele seria so uma moldura.
  const mesesVisiveis = resultado ? (limites.simuladorCompleto ? resultado.depois.length : 1) : 0;
  const temDetalhes =
    resultado !== null &&
    (resultado.parcelas > 1 ||
      resultado.competenciaInicial !== null ||
      (resultado.usoDoLimite !== null && resultado.faltaDeLimite === 0) ||
      resultado.metasAtrasadas.length > 0);

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

      {!temBase && (
        <p className="aviso aviso-atencao">
          Sem entradas lançadas nos últimos meses não há previsão para comparar. Lance o que
          caiu, ou diga quanto costuma entrar por mês.{' '}
          <button type="button" className="link" onClick={() => navegar('/carteira')}>
            Informar na Carteira
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
          <CampoNumero id="vezes" valor={parcelas} min={1} max={48} onChange={setParcelas} />
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

          {temDetalhes && (
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
          )}

          <h2 className="secao-titulo">Como ficam os próximos meses</h2>
          {mesesVisiveis >= 2 && (
            <section className="cartao">
              <LinhaSaldo
                linhas={resultado.depois}
                referencia={resultado.antes}
                visiveis={mesesVisiveis}
                folga={folgaDe(estimativa)}
                maisApertado={resultado.mesMaisApertado}
              />
            </section>
          )}
          <TabelaPrevisao
            linhas={resultado.depois}
            visiveis={mesesVisiveis}
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
 *
 * O LIMITE DO CARTAO MORA AQUI DENTRO, e nao num aviso ao lado. Enquanto morou
 * ao lado, a tela mostrava um cartao verde "Cabe" e, embaixo, um aviso vermelho
 * "nao cabe no limite": duas respostas para a mesma pergunta. `estoura` pode
 * vir sem mes negativo nenhum, entao `mesesNegativos[0]` e opcional aqui.
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
    const pior = resultado.mesesNegativos[0];
    const semLimite = resultado.faltaDeLimite > 0;
    return (
      <section className="veredito veredito-estoura">
        <strong>
          {semLimite ? 'Estoura o limite do cartão' : pior ? `Estoura em ${nomeMes(pior.mes)}` : 'Estoura'}
        </strong>
        {semLimite && (
          <p>
            Faltam {formatarReais(resultado.faltaDeLimite)} de limite: a compra não passa
            {pior ? '.' : ', mesmo cabendo no seu mês.'}
          </p>
        )}
        {pior && (
          <p>
            {semLimite && `E o saldo fica negativo em ${nomeMes(pior.mes)}. `}
            {completo
              ? `Faltam ${formatarReais(Math.abs(pior.saldoAcumulado))} para fechar o mês.`
              : semLimite
                ? ''
                : 'O saldo fica negativo antes do fim do horizonte.'}
          </p>
        )}
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
