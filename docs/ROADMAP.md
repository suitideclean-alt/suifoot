# SuiFoot: ideias e próximos passos (notas de 10/11/2026)

Estado actual: jogo v0.3.3 no ar (https://suitideclean-alt.github.io/suifoot/), com logo, fontes e cores definidas em `assets/brand/` (ver `BRAND.md`).

## 1. Visão em discussão: jogo com blockchain (Sui)

### Duas personagens, dois mundos
- **Dono (investidor)**: tem dinheiro, compra até 3 clubes (NFT: plantel, estádio, cofre, instalações), contrata e despede treinadores, define salário, cláusula de saída e limites, retira lucros acima de uma reserva mínima, pode vender o clube.
- **Treinador (sem capital)**: entra grátis, é contratado por donos, gere o clube dentro dos limites, ganha salário + bónus + participação na venda de jogadores que formou, constrói reputação e pode ser chamado por outros clubes (paga a cláusula de saída).
- Os dois encontram-se num **mercado de vagas** (clube, salário, exigências / perfil, reputação, troféus), com período de experiência opcional.
- O treinador tem um **perfil NFT não transferível** (reputação, XP, troféus, historial). O dono pode também treinar um dos seus clubes.

### Limites que o dono pode definir ao treinador
Orçamento de transferências por época, salário máximo por jogador, preço mínimo de venda (ex. 80% do valor), jogadores intocáveis, empréstimos proibidos ou com teto, aprovação do dono acima de um valor (com prazo para recusar), reserva mínima no cofre.

### Riscos a prevenir
Conluio (treinador vende a amigos abaixo do valor), dono ausente (piloto automático, já existe o modo férias), despedimento abusivo (indemnização), treinador a esvaziar o cofre (salários semanais, só o dono retira lucros).

### O que é NFT e o que não é
- **NFT**: jogador (~1 400 no início, 22 por plantel, ~36 novos por época), clube (48 por liga), estádio, perfil do treinador (não transferível), troféus e cartas de lenda (não transferíveis).
- **Campos dentro do clube** (não NFT): instalações (academia, treino), saldo em SFOOT.
- **Regras/depósitos temporários**: contratos, empréstimos, propostas.
- **Dados fora da cadeia com "impressão digital" na cadeia**: calendário, tabelas, resultados.

### Ciclo de vida do jogador
16-18 nasce na academia (queima SFOOT, potencial sorteado com aleatoriedade verificável) → 19-24 cresce → 25-31 pico → 32-36 declina → ~35-36 reforma: NFT queimado, fica carta de lenda (colecionável sem valor de jogo). A academia repõe o número de jogadores.

### Economia (pontos críticos)
- Quem compra o quê: humano a humano (carteira a carteira); humano ao PC (dinheiro vai para o cofre da liga); **PC a humano é o caso perigoso** (fábrica de dinheiro grátis). Regra: o PC só gasta o que o cofre da liga tem, e com desconto.
- O valor oficial (fórmula do jogo) e o preço real (o que alguém paga) são coisas separadas; nunca pagar com base só na fórmula.
- Valor "no papel" só vira dinheiro quando alguém compra.
- Se o lucro dos donos só vier de outros donos, é uma pirâmide. Precisa de receita real: patrocínios, taxas do mercado, passes de época, cosmética. Os treinadores (que não pagam) são o público e o conteúdo; os donos põem o capital.
- Saída do jogo: o SFOOT e os NFT ficam na carteira da pessoa; sair é vender e trocar por moeda estável, mas depende de haver compradores e traz obrigações legais e fiscais.

### Várias ligas e Liga dos Campeões
- Uma liga = um "país" (4 divisões, 48 clubes). Várias ligas em paralelo, cada uma com identidade própria (nomes ao estilo de cada região, tudo inventado).
- Liga dos Campeões: campeões e vice-campeões das outras ligas (podem ser clubes de outros humanos), em vez dos 12 estrangeiros simulados.
- Problemas: nomes únicos para sempre (registo global; hoje o gerador dá só ~1 800 nomes distintos em 3 600 clubes), calendário comum (relógio partilhado), simulação neutra dos jogos entre ligas (servidor primeiro).
- O modo actual (um mundo, offline) pode ficar como modo para um jogador.

## 2. Decisões em aberto (para amanhã)
1. Caminho económico da primeira versão: **duas moedas** (moeda de jogo grátis + SFOOT real mais tarde; recomendado), tudo dinheiro real, ou sem saída para dinheiro.
2. Limite de **3 clubes por dono**? Quantos clubes humanos por liga?
3. Quantas **regiões/ligas** (3, 6 ou 8)?
4. O SFOOT pode ser trocado por dinheiro real ou fica só moeda de jogo na 1.ª versão?
5. Nomes: gerados por defeito, dono pode renomear uma vez? Regras (tamanho, sem ofensas, sem marcas reais)?
6. Participação do treinador na venda de jogadores formados: que percentagem?
7. Indemnizações: despedimento (salários restantes?) e saída (cláusula fixada no contrato?).

## 3. Trabalho técnico, por ordem proposta
1. **Gerador de nomes** maior, com estilos regionais, sem repetições, registo único e renomear uma vez (rápido, melhora o jogo já).
2. **v0.4 sem blockchain: dono e treinador** no jogo local: papel de dono (comprar clube, contratar/despedir, salário, limites), contratos com indemnização e cláusula de saída, mercado de vagas, bloqueio do treinador fora dos limites, piloto automático, testes de abuso (conluio).
3. **Várias ligas no mesmo jogo local** (ex. 3 ligas de 48 clubes) com Liga dos Campeões entre campeões; ensaio do calendário comum.
4. **Simulação económica**: emissão limitada, ciclo de vida 16-36 com queima e cartas de lenda, cofre da liga; ver se a oferta se mantém estável.
5. **Especificação técnica de uma página** (objetos Move, campos, quem altera o quê).
6. **Servidor + calendário comum**; contratos em Move na **testnet** com moeda de brincar; beta fechado sem troca por dinheiro.
7. **Só depois**: compra e venda de clubes com valor real, auditoria dos contratos e revisão jurídica.

## 4. Avisos que se mantêm
- O nome "SuiFoot" e o uso da gota podem precisar de autorização da Sui. A gota do logo é uma forma genérica, não o logo oficial.
- NFT com valor, token transaccionável e prémios podem ser tratados como valores mobiliários ou jogo a dinheiro em alguns países: revisão jurídica antes de qualquer valor real.
- Confirmar os detalhes técnicos da Sui (aleatoriedade, objectos, carteiras, zkLogin) na documentação oficial antes de construir.
- O multijogador actual é só no mesmo ecrã (hot-seat); o online exige servidor.

## 5. Outras notas
- Usar o kit de marca (`assets/brand/`) para X e outras redes: avatar 400, cabeçalho 1500x500, imagem de partilha 1200x630.

## Next session: path to a public testnet test

Goal: a playable test on Sui **testnet** (play-money only), then invite testers.

1. Decisions (10 min): one currency or two; 3-club limit; SFOOT cash-out = NO for the test; coach share % on sales.
2. One-page Move spec: objects (Club, Player, OwnerCap, CoachCap), SFOOT coin, market rules, academy randomness.
3. Move package on testnet + unit tests (`sui move test`); read PAS and dynamic-field docs first (see docs/SUI-RESEARCH.md).
4. Game client: zkLogin (Google) + sponsored transactions so testers need no wallet or SUI.
5. Server: runs matches and the shared calendar, posts results on-chain.
6. Closed test with a few people, fix, then open invitations.

Needs from the owner: a Sui wallet (testnet), an Enoki account for sponsored gas, and a place to host the small server.


## v0.4.0 status
Owner layer shipped for the coach and owner-coach roles (see docs/OWNER-COACH-RULES.md).

## v0.5.0 status
The owner role is playable: computer coach, hire/fire/renew, limits editor, requests inbox, coach market, untouchable players. Next: play-test, then the testnet work.

## v0.6.0 status
Wallet login: connect any Sui wallet (Wallet Standard, no library) at the setup screen or in the header. One save slot per address on this device; a guest game is adopted by the first wallet that connects. Nothing is signed or sent on chain yet: the address only identifies the player. Next on chain: signed login proof checked by a server, then the Move package (see docs/SUI-RESEARCH.md).

## v0.7.0
Owner/coach tabs reorganised, job centre with CVs and clause negotiation, NPC coaches for every club, manager (computer finance), auto-advance, loans via coach request, owner no longer controls tactics/skills.
