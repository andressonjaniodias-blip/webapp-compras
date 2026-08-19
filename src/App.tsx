/**
 * O esqueleto: rotas e a porteira da sessao.
 *
 * As rotas sao por HASH (#/compra/abc) de proposito. Assim o servidor so ve
 * "/" e nunca precisa de configuracao para reescrever caminho — o que evita a
 * classe inteira de bug em que recarregar a pagina dentro do app devolve 404.
 */

import { HashRouter, Route, Routes } from 'react-router-dom';
import { Ajustes } from './paginas/Ajustes';
import { EditarCompra } from './paginas/EditarCompra';
import { Entrar } from './paginas/Entrar';
import { ListaCompras } from './paginas/ListaCompras';
import { Resumo } from './paginas/Resumo';
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
      <Route path="/" element={<ListaCompras />} />
      <Route path="/compra/:id" element={<EditarCompra />} />
      <Route path="/resumo" element={<Resumo />} />
      <Route path="/ajustes" element={<Ajustes />} />
      <Route path="*" element={<ListaCompras />} />
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
