# Aritmética determinística do motor (v0.9.28)

## Regra
A lógica de jogo (`core, bank, body, world, match, game, owner, boss, actions, extras`) **não chama** `Math.exp/log/pow/sin/cos/random` (testado em `tests/q.js`). Usa `SF.Q` (`src/q.js`), construído só com `+ − × ÷` sobre doubles IEEE-754 (arredondamento exato em JS, Rust, wasm e zkVM), com número fixo de iterações:

| Função | Algoritmo |
|---|---|
| `Q.exp(x)` | `x = k·ln2 + r`, série de Taylor com 16 termos, escala por 2^k com duplicações exatas |
| `Q.ln(x)` | `x = m·2^k`, `ln m = 2·atanh((m−1)/(m+1))` com 24 termos |
| `Q.pow(x,y)` | `exp(y·ln x)` |
| `Q.sqrt(x)` | Newton, ponto inicial potência de 2, 10 iterações |
| `Q.isqrt(n)` | raiz inteira exata |
| `Q.cos(t)` | redução a [0, π/2] e Taylor com 12 termos (Box-Muller em `R.gauss`) |
| `Q.ilog2(n)` | exato |

Precisão medida contra `Math.*`: ≤ 1e-13 (relativo) nos intervalos do jogo.

## Vetores de teste (ouro)
`docs/vectors/engine.json` (gerado por `node tests/vectors.js --write`, verificado em `npm test`): saídas exatas (bits dos doubles) de `Q.*` e o resumo de 3 épocas completas (sementes 3, 11, 42). Qualquer porte (Rust/wasm, Move em ponto fixo, zkVM) tem de reproduzir estes valores; só se regeneram quando as regras mudam de propósito.

## Regras para quem portar o motor

Estas não são opcionais: quebrar qualquer uma delas dá resultados diferentes com a mesma semente.

1. **Ordem dos jogadores.** O motor percorre `G.players` com `for (const pid in ...)` em cinco sítios (`game.js` ×3, `body.js` ×2). Em JavaScript as chaves são números inteiros e a ordem é crescente, garantida pela norma. Num porte, usar **um mapa ordenado por id** (`BTreeMap` em Rust), nunca um `HashMap`.
2. **Ordem dos clubes.** `G.clubIds` é uma lista, pela ordem de criação (`c0`…`c71`, depois `e72`…). Guardar a lista, não derivá-la das chaves de um mapa.
3. **Ordenações.** Todas as chamadas a `sort` dependem de ser estável (é-o em JavaScript desde 2019). Usar ordenação estável no porte (`sort_by` em Rust), ou desempatar sempre pelo id.
4. **Números a contar.** Ciclos sobre valores decimais contam em inteiros (ver `A.bestPrice`, que conta em décimos). Nunca somar `0.1` repetidamente.
5. **Valores que o jogador lê** (reputação, confiança da direção) são arredondados a duas casas com `util.r2` a cada alteração, para não acumularem erro.
6. **Nada entra sem validação.** Qualquer número vindo de fora passa por `util.num`, `util.int` ou `util.amount` (`core.js`). `NaN` faz qualquer comparação dar falso, por isso um valor inválido atravessaria verificações de preço e de saldo sem as acionar (`tests/hostile.js` cobre isto).

## Configuração

Todos os números das regras estão em `SF.CFG` (`core.js`), incluindo `CFG.owner`. `CFG.rules` é a versão das regras e sobe sempre que algum muda: uma gravação, uma jornada assinada e um contrato levam-na, para se saber de imediato se as duas partes jogam pelas mesmas regras.

## Ponto fixo para Move (v0.9.28)

`src/fixed.js` (`SF.FX`) é a **mesma matemática só com inteiros**, escrita em BigInt a imitar o que Move tem: sem `Math.*`, sem divisão com vírgula, sem nenhuma conversão para double. O sinal anda ao lado da grandeza, porque Move não tem inteiros com sinal. Não é carregada pelo jogo — o browser continua com `SF.Q`. É a especificação de onde o porte Move se escreve, linha a linha.

**Escala Q32.32**: um real `x` guarda-se como `round(x · 2^32)`.

### Quantos bits são precisos (medido, não suposto)

Arredondando cada probabilidade do motor a grelhas cada vez mais grosseiras, ao longo de 7 sementes × 3 épocas:

| bits de fração | épocas idênticas | maior desvio de pontos |
|---|---|---|
| 8 | 0 de 7 | 49 |
| 12 | 0 de 7 | 51 |
| 16 | 0 de 7 | 56 |
| **20** | **7 de 7** | **0** |
| 32 | 7 de 7 | 0 |

A fronteira está entre 16 e 20 bits. Q32.32 deixa **12 bits de folga** para o arredondamento das contas intermédias. Abaixo de 20 bits o jogo não parte, apenas passa a ser outro jogo (continua a dar ~2,8 golos por jogo).

### Erro medido nos intervalos que o jogo usa

Recolhidos de duas épocas reais: `exp` entre −1,43 e 5,28 (217 571 chamadas), `ln` entre 0,0001 e 3,55 (74 732), `pow` base 0,41 a 3,55 (71 187), `sqrt` até 19,36, `cos` em [0, 2π).

| função | erro absoluto | erro relativo |
|---|---|---|
| `exp` | 2,4e-7 | 1,6e-9 |
| `ln` | 6,3e-7 | 6,8e-8 |
| `sqrt` | 5,0e-10 | 3,6e-9 |
| `cos` | 6,6e-10 | 3,6e-9 |
| `pow` | 4,9e-9 | 2,9e-9 |

**Consequência**: o motor toma 1 023 367 decisões por época, todas `sorteio < probabilidade`. Somando as frestas que um erro de 1e-9 abre, dá **uma decisão trocada a cada ~5 100 épocas**. Na prática: uma época jogada com `SF.FX` dá tabela, campeão e vencedor da taça **idênticos** (verificado em `tests/fixed.js`).

### Regra de tipos para o porte

- **Dinheiro e contagens não levam escala.** Já são inteiros no motor e vão para Move como `u64` simples. Se levassem escala, 4 milhões ao quadrado transbordava o `u64`.
- **Só rácios, probabilidades e avaliações levam escala**, e esses são pequenos: o mais largo que o motor alcança é `exp(5,28) = 196`.
- **Guardar em `u64`, multiplicar em `u128`**: `(a·b) >> 32` com a promoção no meio, que é o padrão habitual em Move.

## O que falta para Move (inteiros)
- Move não tem decimais. O resto da lógica usa doubles com `+ − × ÷` (determinístico em IEEE-754, mas sem tipo equivalente em Move). Para Move, usar ponto fixo (u128 com escala 1e9 ou 2^32): cada fórmula passa a inteiros escalados com a mesma ordem de operações e os mesmos termos de série; `tests/vectors.js` mede a diferença máxima aceitável (a definir, tipicamente ≤ 1 unidade da última casa).
- Alvo recomendado para a simulação: Rust compilado para wasm (mesmos doubles que o motor) e Move apenas para regras e economia.
- Semente: o motor já não usa o relógio (semente por defeito = 1); a interface passa sempre a semente.
