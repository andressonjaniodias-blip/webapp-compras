/**
 * "Carregando…", anunciado.
 *
 * Era `<p className="carregando">` repetido em 15 telas, sem papel nenhum: quem usa
 * leitor de tela abria a pagina e ouvia silencio. Com `role="status"` o texto e lido
 * quando aparece, sem tirar o foco de onde esta.
 */

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <p className="carregando" role="status">
      {texto}
    </p>
  );
}
