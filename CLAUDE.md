# webapp-compras

Registro pessoal de compras. **Local-first**: escreve no IndexedDB do aparelho e
sincroniza com Postgres na nuvem quando ha internet. Funciona sem sinal.

**Contexto completo, decisões e pendências:**
`C:/Users/Andresson Dias/Documents/Obsidian Vault/Projetos/webapp-compras/`
Leia antes de mudanças estruturais; registre decisões novas lá ao encerrar.

## Stack

React 19 + TypeScript + Vite 8 · Dexie 4 (IndexedDB) · `react-router-dom` 7
(rota por **hash**) · `vite-plugin-pwa` · `write-excel-file`.
Servidor: Hono sobre Node · `@neondatabase/serverless` · `@anthropic-ai/sdk`.
Hospedagem: servidor no **Render**, banco no **Neon** (o Postgres do Render
expira em 30 dias — nunca use ele). Sem ESLint/Prettier.

## Comandos

```bash
npm run dev          # Vite + API juntos
npm run build        # typecheck dos dois lados + build do app e do servidor
npm run teste:sync   # sincronização, contra Postgres em memória
npm run teste:contas # centavos, ciclo, contagem dupla, previsão, categorização
npm start            # o que o Render executa
npm run segredo      # gera o SESSAO_SEGREDO
```

`build`, `teste:sync` e `teste:contas` são as únicas verificações automáticas.
Rode as três antes de dar qualquer mudança por concluída.

## Invariantes — quebrar qualquer uma destas é bug

1. **Dinheiro é inteiro em centavos, sempre.** Nunca float. A conversão para
   texto pt-BR vive só em `src/lib/dinheiro.ts`.
2. **Tempo é inteiro em milissegundos** (`Date.now()`), nunca `Date` serializado.
3. **O `total` do item é digitável e soberano.** Ele é o valor do cupom. O
   `precoUnitario` é histórico e **nunca** recalcula dinheiro: 1,235 kg ×
   R$ 14,99 dá R$ 18,51, mas a balança cobra R$ 18,52.
4. **O autopreenchimento preenche campo vazio e nunca sobrescreve o digitado.**
   Sobrescrever corromperia o preço de prateleira no histórico.
5. **Nenhum componente fala com o Dexie.** Todo acesso passa por
   `src/dados/compras.ts` ou `src/dados/financas.ts` — as duas portas, e mais
   nenhuma. Elas carimbam `atualizadoEm` e `pendente = 1` (o `carimbo()` mora
   em `banco.ts` para as duas usarem o mesmo). Escrita fora dali não sobe para a
   nuvem, e o sintoma só aparece semanas depois.
6. **Nada é apagado de verdade.** Excluir carimba `excluidoEm`; toda consulta
   ignora quem está na lápide.
7. **`pendente` é 0/1, não booleano nem `null`.** O IndexedDB não indexa
   booleano nem nulo — a fila de envio ficaria invisível.
8. **`/api/*` responde sempre JSON, nunca HTML.** O cliente trata resposta
   não-JSON como sessão expirada; um 404 em HTML mandaria você fazer login.
9. **Nada do lado financeiro é obrigatório (Princípio 0).** Quem nunca cadastrou
   conta nem renda não ganha **número** nenhum: sem linha de previsão, sem chip
   de conta no formulário, sem aviso de "configure alguma coisa". Os NÚMEROS vêm
   do DADO, não de preferência. **A PORTA, não**: o 💳 da tela inicial existe
   sempre e só some por escolha explícita (o modo do app, em Ajustes). Esconder
   a porta escondia junto o único caminho para criar a primeira conta — e num
   aparelho novo, antes da primeira sincronização, tornava contas e cartões
   inalcançáveis. Ver `decisões.md` no cofre.
10. **Compra no crédito não sai do caixa; a fatura sai.** Pagar a fatura é
    `Transferencia`, e ela nunca conta como gasto novo — o gasto foi contado
    quando a compra foi lançada. Somar os dois é a contagem dupla que o
    `teste:contas` existe para impedir.
11. **A soma das parcelas é exatamente o total.** R$ 100,00 em 3x são
    33,34 + 33,33 + 33,33; a primeira absorve o resto. Nunca 99,99.
12. **Renda recorrente é versionada, nunca editada retroativamente.** Aumento
    encerra a antiga e cria a nova; editar o valor no lugar reescreveria todos
    os meses anteriores em silêncio.
13. **O saldo de partida é uma DATA, e o corte é por dia.** `saldoInicialEm`
    diz de quando o saldo informado vale; ele só muda quando o usuário muda, e
    `saldoDaConta` compara pela meia-noite daquele dia, com `>=` para renda,
    compra e transferência. Hora nunca decide se dinheiro existe. Enquanto o
    corte era o instante do toque, digitar o saldo engolia em silêncio o que
    tinha sido cadastrado minutos antes.
14. **Em `ocorrenciasDeRenda`, o piso é o dia e o teto é o instante.** O piso é
    por dia porque a ocorrência nasce com segundos zerados e `criarRenda` grava
    `Date.now()`: comparar instantes apagava a primeira ocorrência de toda renda
    recorrente recém-criada. O teto continua sendo o instante porque a previsão
    do mês corrente conta o que ainda vai cair e o saldo conta o que já caiu —
    arredondar o teto faria a mesma parcela ser contada nos dois lados.
15. **Quem envia e quem recebe transferência está em `compartilhado/tipos.ts`.**
    Origem: corrente e dinheiro. Destino: corrente, dinheiro e vale — o vale
    recebe (o benefício pode cair na corrente) mas nunca envia, porque o cartão
    dele só paga compras. **Crédito fica fora dos dois lados**: mandar dinheiro
    para um cartão é *pagar a fatura*, e pagamento precisa de `competencia` para
    quitar o ciclo certo, coisa que só a tela da fatura faz. Aceitar isso como
    transferência deixaria a fatura eternamente em aberto.
16. **Competência vencida é presumida paga, e presunção é marcada.** Quem
    cadastra hoje um financiamento que já corre há um ano não vai registrar
    doze pagamentos, e esse dinheiro já saiu da conta antes do saldo de
    partida — cobrá-lo de novo seria contagem dupla. Mas competência com
    **qualquer** pagamento registrado nunca é presumida: pagar R$ 40 de uma
    fatura de R$ 100 é dizer que você acompanha aquele ciclo, e presumir os
    R$ 60 esconderia rotativo real. `Ciclo.presumido` existe para a tela dizer
    que foi presunção em vez de fingir pagamento.
17. **Desconto em folha: renda bruta, e a parcela sai da conta na data do
    salário.** A entrada cadastrada é o salário *antes* do desconto do
    empréstimo, então o consignado precisa sair de `Divida.contaId` para o
    saldo bater com o extrato — presumir sem descontar faria o saldo subir a
    parcela todo mês, em silêncio. Havendo pagamento registrado na
    competência, o desconto presumido não se aplica: seriam duas saídas.
18. **`compartilhado/planos.ts` é a única fonte dos limites de plano.** Nada de
    `if (plano === 'pago')` espalhado. E só a IA é barrada no servidor: o resto
    é porteira de tela, assumido por escrito.
19. **A sobra do mês é a variação do saldo em conta.** `MesFinanceiro.sobra`
    tem de bater com o quanto `saldoEmConta` mudou entre o começo do mês e
    agora — é contra isso que a seção 17b de `teste:contas` a confere, porque a
    identidade "sobra = soma das parcelas" passava com as parcelas erradas. Daí
    três regras: o **vale fica fora dos dois lados** (a recarga não é entrada de
    caixa, a compra no vale não é saída); o que a conta **manda para o vale**
    sai; e o teto das entradas é **agora**, não o fim do mês. "Caixa" tem uma
    definição só, `ehDeCaixa`, usada pelo saldo e pela sobra.
20. **O veredito do simulador é um só, e o limite do cartão entra nele.**
    Compra que o cartão recusa é `estoura`, por mais folga que o mês tenha —
    então `estoura` pode vir sem nenhum mês negativo, e a tela não pode supor
    `mesesNegativos[0]`. Enquanto o limite morou num aviso ao lado, a tela
    mostrava "Cabe" em verde e "não cabe no limite" em vermelho ao mesmo tempo.
    Limite `0` é "não informado": sem o dado, não há estouro por limite.
21. **A tela inicial mostra um saldo, não uma sobra.** `Panorama.fechaOMesCom`
    é o saldo em conta previsto para o fim do mês. A sobra do mês parcial, que
    ela mostrava antes, fica negativa no dia seguinte ao último pagamento do
    mês sem que nada de ruim tenha acontecido. Sem conta de dinheiro o campo é
    `null` e a tela mostra a sobra prevista de um mês cheio (Princípio 0).

## Convenções

- **Data e mês são montados à mão, nunca por `Intl.DateTimeFormat`.** A
  locale pedida só vale se o runtime tiver os dados dela; faltando, ele cai
  na do sistema e a mesma data vira 09/01/2026 num aparelho e 01/09/2026 no
  outro, sem erro para investigar. Ver `src/lib/datas.ts` e a seção 16 de
  `teste:contas`, que roda no Node justamente por ser outro runtime.

- **Cor é papel, nunca valor.** Regra de `src/estilos.css` cita token
  (`--superficie`, `--estoura-texto`), não hex: o app tem tema claro e escuro, e
  cor fixa numa regra quebra no outro. Cor de barra (`--cabe`, `--aperta`,
  `--estoura`) não é cor de texto — texto usa a variante `-texto` e fundo
  tingido usa a `-suave`; sobre `--acento` só vai `--sobre-acento`. O bloco
  escuro de tokens existe **duas vezes** (aparelho no escuro, e escuro fixado em
  Ajustes) e os dois têm de ficar iguais. A escolha mora no `localStorage`
  (`src/lib/tema.ts`), não no Dexie, porque precisa valer antes do primeiro
  quadro; o `index.html` lê a mesma chave.
- **Valor em destaque usa `--fonte-valor`** (Geist Mono); texto usa `--fonte`
  (Outfit). As duas são servidas pelo próprio app, e só o arquivo latino de
  cada uma entra no build — fonte de fora quebraria o uso sem sinal.

- Identificadores, arquivos e comentários em **português**.
- Comentário de bloco no topo do arquivo explicando **por que** ele existe, não
  o que faz. Siga o tom de `src/dados/compras.ts` e `compartilhado/tipos.ts`.
- Aspas simples, ponto e vírgula, indentação de 2 espaços.

## Cuidados

- **O driver do Neon é o HTTP, não um pool.** Conexão ociosa impede o banco de
  suspender e queima as 100 horas de compute do plano gratuito em silêncio.
- **`tsx watch` não sobe sob o `concurrently` no Windows** — por isso `npm run
  dev` usa `tsx` puro. Para auto-reload do servidor, rode `npm run dev:api`
  separado.
- **Sem `DATABASE_URL`, o servidor sobe com Postgres local** (PGlite em
  `.dados/`) e **sem senha**. Isso só vale em desenvolvimento: havendo
  `DATABASE_URL`, ele se recusa a subir sem `SENHA_HASH`.
- **As dicas de IA pedem duas variáveis: `ANTHROPIC_API_KEY` e `PLANO=pago`.**
  Só a chave não liga nada. O modelo vem de `MODELO_IA` (padrão
  `claude-haiku-5-5`) e a lista aceita é fechada, em `compartilhado/modelos.ts`:
  os modelos não aceitam a mesma chamada — o Haiku 4.5, por exemplo, rejeita o
  `effort` que as duas rotas enviam. Nada disso tem teste contra a API de
  verdade: `teste:contas` só cobre a validação do nome.
- Falha de rede **não** tranca o app. A tela de senha só aparece quando o
  servidor diz explicitamente que não há sessão. Ver `src/estado.tsx`.
- Nenhum segredo no repositório nem no cofre — só onde ele mora.
- **O `.env` local aponta para o Neon de PRODUÇÃO.** Para mexer no app sem
  tocar nos dados reais, suba com as variáveis vazias — elas vencem o arquivo,
  porque `process.loadEnvFile` não sobrescreve o que já existe no ambiente:
  `DATABASE_URL= SENHA_HASH= SESSAO_SEGREDO= PGLITE_DIR=/tmp/pg npm run dev`.
- **Coluna nova exige TAMBÉM um `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.**
  `CREATE TABLE IF NOT EXISTS` não acrescenta coluna em tabela que já existe,
  então coluna declarada só no `CREATE` nasce em banco novo e falta em todo
  banco publicado — e a autocura reaplica um esquema que não tem como
  consertar nada. Aconteceu duas vezes (`compras` na v2, `dividas` em
  01/09/2026). O teste `toda coluna que a sincronizacao escreve existe no
  banco`, em `teste:sync`, existe para pegar a terceira: ele aplica o esquema
  sobre um banco antigo e compara com `COLUNAS_SINCRONIZADAS`.
- **Ao acrescentar tabela ou coluna, aplique o esquema no banco publicado** com
  `npm run banco:criar`. Esquecer isso derrubou toda a sincronização uma vez
  (31/08/2026), então hoje `/api/sync` **se autocura**: falhou com `42P01` ou
  `42703`, ela aplica o `esquema.sql` e refaz, uma vez. A rede de segurança
  não dispensa o passo — só tira dele o poder de derrubar a nuvem.
- **`esquema.sql` é dividido em comandos por `comandosDoEsquema`**, que tira os
  comentários antes de quebrar no `;`. Um ponto e vírgula dentro de comentário
  partia o arquivo no lugar errado e derrubava a subida do servidor.
