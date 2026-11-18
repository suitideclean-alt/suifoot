# Aritmética determinística do motor (v0.9.25)

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

## O que falta para Move (inteiros)
- Move não tem decimais. O resto da lógica usa doubles com `+ − × ÷` (determinístico em IEEE-754, mas sem tipo equivalente em Move). Para Move, usar ponto fixo (u128 com escala 1e9 ou 2^32): cada fórmula passa a inteiros escalados com a mesma ordem de operações e os mesmos termos de série; `tests/vectors.js` mede a diferença máxima aceitável (a definir, tipicamente ≤ 1 unidade da última casa).
- Alvo recomendado para a simulação: Rust compilado para wasm (mesmos doubles que o motor) e Move apenas para regras e economia.
- Semente: o motor já não usa o relógio (semente por defeito = 1); a interface passa sempre a semente.
