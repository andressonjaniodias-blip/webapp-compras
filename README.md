# Compras

Registro pessoal de compras, para usar no celular dentro da loja.

Abre uma compra, lança os itens enquanto compra — ou só o total, quando o
detalhe não interessa — e no fim do mês mostra para onde o dinheiro foi.

**Os dados são gravados no aparelho** (IndexedDB) e sincronizados com um
Postgres na nuvem quando há internet. Isso significa que o app funciona no
corredor do mercado sem sinal, e que perder o celular não perde o histórico.

## O que ele faz

- Compras com ou sem itens. O total é a soma dos itens; sem itens, é o valor
  digitado à mão.
- **Três campos por item**: quantidade, preço unitário e valor total, todos
  digitáveis. Dois preenchem o terceiro, e o que você digitou nunca é
  sobrescrito.
- **Autopreenchimento**: digite "arr" e o app sugere "Arroz 5kg — R$ 24,90 ·
  12/07", preenchendo unidade, preço e quantidade num toque.
- Resumo do mês por categoria e forma de pagamento, comparado com o mês
  anterior.
- Exportação para `.xlsx` (duas abas ligadas por ID), `.csv` e backup `.json`
  que volta.
- Análise de economia por IA (opcional).
- Instalável como app na tela inicial (PWA).

## Por que o item tem três campos

Alcatra: 1,235 kg a R$ 14,99/kg. A multiplicação dá R$ 18,5126, que arredonda
para R$ 18,51 — mas a balança do mercado imprime **R$ 18,52**. Um app que só
soubesse multiplicar fecharia a compra um centavo fora do cupom por item
pesado, e não haveria como descobrir onde.

Por isso o **valor total do item é digitável e é ele que manda**. O preço
unitário fica guardado como histórico, para comparar preços entre meses, e
nunca é usado para recalcular dinheiro.

## Rodar na sua máquina

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Sem nenhuma configuração, o servidor sobe com um
Postgres local (em `.dados/`) e **sem senha** — modo de desenvolvimento.

Verificações:

```bash
npm run build       # typecheck e build dos dois lados
npm run teste:sync  # sincronização contra um Postgres em memória
```

## Publicar de graça

Duas contas, nenhuma pede cartão:

### 1. Banco no Neon

Crie um projeto em [neon.tech](https://neon.tech) e copie a string de conexão.
O plano gratuito é permanente: 0,5 GB, sem data de validade. O banco suspende
sozinho depois de 5 minutos parado e acorda em milésimos de segundo.

> **Não use o Postgres do Render.** O gratuito dele expira 30 dias depois de
> criado e depois apaga os dados.

Com a string em mãos, aplique o esquema:

```bash
echo "DATABASE_URL=postgres://..." >> .env
npm run banco:criar
```

### 2. Servidor no Render

Crie um Web Service apontando para este repositório. O `render.yaml` já traz
build, start e a lista de variáveis. Preencha no painel:

| Variável | Como obter |
| --- | --- |
| `DATABASE_URL` | a string do Neon |
| `SENHA_HASH` | `npm run senha:hash -- "sua senha"` |
| `SESSAO_SEGREDO` | qualquer string longa e aleatória |
| `ANTHROPIC_API_KEY` | opcional, veja abaixo |

O plano gratuito hiberna depois de 15 minutos parado e leva perto de um minuto
para acordar. **Isso atrapalha pouco**: abrir o app e registrar compras não
depende do servidor. Só a sincronização e a análise de IA falam com ele, e a
sincronização espera em segundo plano sem travar a tela.

## As dicas de IA

Opcionais. Sem `ANTHROPIC_API_KEY` configurada, o app funciona inteiro e a tela
de resumo apenas avisa que as dicas estão desligadas.

Com a chave, o botão **Analisar** manda o mês (e o anterior, para comparar) para
o Claude, que aponta o que subiu, o que se repete e onde dá para cortar. Custa
por volta de **US$ 0,10 por análise** — a chave fica só no servidor e nunca
chega ao navegador.

## Segurança

| Camada | Protege contra | Onde age |
| --- | --- | --- |
| Senha do app | outra pessoa abrir a sua URL | servidor |
| Cookie de sessão assinado | forjar acesso sem a senha | servidor |
| Chave da IA no servidor | alguém gastar sua cota da API | servidor |

Os dados do aparelho não são criptografados: quem estiver com o celular
destravado vê as compras. A senha protege a nuvem e a API, não a tela.

**Nenhum segredo mora neste repositório.** O `.env` é ignorado pelo git; em
produção as variáveis vivem no painel do Render.
