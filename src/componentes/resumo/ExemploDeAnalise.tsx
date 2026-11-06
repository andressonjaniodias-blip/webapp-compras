/**
 * O exemplo recolhido da analise de IA, para quem esta no plano gratuito. Texto fixo:
 * nao chama a API. Saiu de `paginas/Resumo.tsx`.
 */


/**
 * O exemplo estatico da analise, para o plano gratis.
 *
 * E texto fixo: NAO chama a API. Custa zero e mostra melhor o que o plano pago
 * entrega do que uma amostra que expira — e, num projeto que roda em free tier
 * permanente, esse custo zero e o que torna o exemplo possivel.
 *
 * Fica RECOLHIDO porque sao dois cartoes de exemplo competindo por altura de
 * tela com o dado real de quem ja esta ali para conferir o proprio mes.
 */
export function ExemploDeAnalise() {
  return (
    <details>
      <summary className="dica">
        <span className="selo selo-plano">plano pago</span> A análise lê o mês inteiro com os
        itens, compara com o anterior e olha os próximos doze meses. Ver um exemplo.
      </summary>
      <div className="cartao cartao-exemplo">
        <strong>Arroz subiu 20% em dois meses</strong>
        <p className="texto">
          O arroz de 5 kg passou de R$ 24,90 em julho para R$ 29,90 em agosto, e ele aparece em
          três das quatro compras de mercado do mês.
        </p>
        <span className="selo selo-pendente">economia estimada R$ 20,00/mês</span>
      </div>
      <div className="cartao cartao-exemplo">
        <strong>Daqui para frente</strong>
        <p className="texto">
          Com as parcelas já contratadas, dá para comprometer cerca de R$ 380 por mês sem
          estourar. O mês mais apertado é novembro, quando a fatura sobe por causa das parcelas
          da geladeira.
        </p>
      </div>
    </details>
  );
}
