# Aritmética determinística do motor (v0.9.12)

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

## O que falta para Move (inteiros)
- Move não tem decimais. O resto da lógica usa doubles com `+ − × ÷` (determinístico em IEEE-754, mas sem tipo equivalente em Move). Para Move, usar ponto fixo (u128 com escala 1e9 ou 2^32): cada fórmula passa a inteiros escalados com a mesma ordem de operações e os mesmos termos de série; `tests/vectors.js` mede a diferença máxima aceitável (a definir, tipicamente ≤ 1 unidade da última casa).
- Alvo recomendado para a simulação: Rust compilado para wasm (mesmos doubles que o motor) e Move apenas para regras e economia.
- Semente: o motor já não usa o relógio (semente por defeito = 1); a interface passa sempre a semente.
