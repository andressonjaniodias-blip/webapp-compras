/**
 * O esqueleto: rotas e a porteira da sessao.
 *
 * As rotas sao por HASH (#/compra/abc) de proposito. Assim o servidor so ve
 * "/" e nunca precisa de configuracao para reescrever caminho — o que evita a
 * classe inteira de bug em que recarregar a pagina dentro do app devolve 404.
 */

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Ajustes } from './paginas/Ajustes';
import { Carteira } from './paginas/Carteira';
import { Contas } from './paginas/Contas';
import { Dividas } from './paginas/Dividas';
import { EditarCompra } from './paginas/EditarCompra';
import { Entrar } from './paginas/Entrar';
import { Fatura } from './paginas/Fatura';
import { Inicio } from './paginas/Inicio';
import { ListaCompras } from './paginas/ListaCompras';
import { Metas } from './paginas/Metas';
import { Parcela } from './paginas/Parcela';
import { Receitas } from './paginas/Receitas';
import { Resumo } from './paginas/Resumo';
import { Simular } from './paginas/Simular';
import { Transferencias } from './paginas/Transferencias';
import { ProvedorApp, useApp } from './estado';

function Conteudo() {
  const { acesso } = useApp();

  if (acesso === 'verificando') {
    return (
      <div className="app">
        <p className="carregando">Abrindo…</p>
      </div>
    );
  }

  if (acesso === 'bloqueado') return <Entrar />;

  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/compras" element={<ListaCompras />} />
      <Route path="/receitas" element={<Receitas />} />
      <Route path="/compra/:id" element={<EditarCompra />} />
      <Route path="/resumo" element={<Resumo />} />
      <Route path="/ajustes" element={<Ajustes />} />
      {/* O lado financeiro. As rotas existem sempre; o que decide se alguem
          chega ate elas e haver dado que as sustente — nenhum icone leva a
          Carteira antes da primeira conta ou entrada. */}
      <Route path="/carteira" element={<Carteira />} />
      <Route path="/simular" element={<Simular />} />
      <Route path="/contas" element={<Contas />} />
      {/* A tela de "Entradas" (a regra recorrente) foi absorvida por Receitas. O
          redirecionamento existe para link antigo e PWA em cache nao cairem num 404. */}
      <Route path="/rendas" element={<Navigate to="/receitas" replace />} />
      <Route path="/dividas" element={<Dividas />} />
      <Route path="/transferencias" element={<Transferencias />} />
      <Route path="/metas" element={<Metas />} />
      <Route path="/fatura/:contaId/:competencia" element={<Fatura />} />
      <Route path="/parcela/:dividaId/:competencia" element={<Parcela />} />
      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <ProvedorApp>
        <Conteudo />
      </ProvedorApp>
    </HashRouter>
  );
}
