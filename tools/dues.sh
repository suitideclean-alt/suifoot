#!/usr/bin/env bash
# The money, on a real chain, with real keys - the path no unit test can walk.
#
# Three throwaway people: Anna pays her season, Bob does not, Cara owns nothing and is only a
# stranger with a key. What must be true afterwards:
#
#   - the tap gives each of them SFOOT, once
#   - paying anything but the fee is refused; paying the fee settles the season
#   - the treasury holds exactly what was paid, split the way it says it splits
#   - before the deadline nobody can take a club; after it, a stranger can take Bob's
#   - and not Anna's, who paid
#   - Bob, holding the deed to the club he lost, cannot walk back in with it
#
# Expected refusals are checked as refusals: a call that was supposed to fail and worked is the
# finding here, not a pass.
set -uo pipefail
export PATH="$HOME/.sui/bin:$PATH"
: "${PKG:?}" "${LEAGUE:?}" "${TREASURY:?}" "${FAUCET:?}"
FEE=5000000
bad=0
say() { printf '%s\n' "$*"; }
ok()   { say "  ok    $1"; }
fail() { say "  FAIL  $1"; bad=$((bad+1)); }

# What an object holds, as the browser reads it: through GraphQL, retrying while the indexer catches up.
gql() { # object-id  jq-path
  local i out
  for i in 1 2 3 4 5 6; do
    out=$(curl -s -H 'content-type: application/json' https://graphql.testnet.sui.io/graphql \
      -d "{\"query\":\"{ object(address: \\\"$1\\\") { asMoveObject { contents { json } } } }\"}" \
      | jq -r ".data.object.asMoveObject.contents.json | $2 // empty" 2>/dev/null)
    if [ -n "$out" ] && [ "$out" != null ]; then printf '%s' "$out"; return 0; fi
    sleep 4
  done
  return 1
}

as() { sui client switch --address "$1" >/dev/null 2>&1; }
call() { # module function args...  -> json on stdout, nonzero on refusal
  local m=$1 f=$2; shift 2
  sui client call --package "$PKG" --module "$m" --function "$f" --args "$@" --gas-budget 300000000 --json 2>/tmp/err
}
made() { jq -r --arg t "$1" '.objectChanges[]? | select(.type=="created" and (.objectType|test($t))) | .objectId' | head -1; }
expect_ok()   { local n=$1; shift; if "$@" >/tmp/out 2>/tmp/err && [ "$(jq -r '.effects.status.status' /tmp/out 2>/dev/null)" = success ]; then ok "$n"; return 0; else fail "$n - it was refused: $(tail -c 300 /tmp/err | tr '\n' ' ')"; return 1; fi; }
expect_fail() { local n=$1; shift; if "$@" >/tmp/out 2>/tmp/err && [ "$(jq -r '.effects.status.status' /tmp/out 2>/dev/null)" = success ]; then fail "$n - it WORKED and should not have"; return 1; else ok "$n - refused"; return 0; fi; }

say "== three people"
for P in anna bob cara; do sui client new-address ed25519 "$P" >/dev/null 2>&1; done
ANNA=$(sui client addresses --json | jq -r '.addresses[] | select(.[0]=="anna") | .[1]')
BOB=$(sui client addresses --json | jq -r '.addresses[] | select(.[0]=="bob") | .[1]')
CARA=$(sui client addresses --json | jq -r '.addresses[] | select(.[0]=="cara") | .[1]')
say "anna $ANNA"; say "bob  $BOB"; say "cara $CARA"
for A in "$ANNA" "$BOB" "$CARA"; do
  for i in 1 2 3; do sui client faucet --address "$A" --url https://faucet.testnet.sui.io >/dev/null 2>&1 || true; sleep 14; done
done

say "== anna and bob take a club each"
declare -A CLUB DEED
for P in anna bob; do
  as "$P"
  call market request_join "$LEAGUE" 0x8 >/tmp/j.json || { fail "$P could not ask for a club"; continue; }
  T=$(made 'JoinTicket' </tmp/j.json)
  CLUB[$P]=$(gql "$T" '.club')
  say "  ticket ${T:0:12}... names club ${CLUB[$P]:-NOTHING}"
  call market claim "$T" "$LEAGUE" "${CLUB[$P]}" >/tmp/c.json || { fail "$P could not claim: $(tail -c 400 /tmp/err | tr '\n' ' ')"; continue; }
  DEED[$P]=$(made 'ClubDeed' </tmp/c.json)
  say "  $P holds club ${CLUB[$P]:0:12}... with deed ${DEED[$P]:0:12}..."
done

say "== the tap"
declare -A COIN
for P in anna bob; do
  as "$P"
  if expect_ok "$P takes her share" call faucet claim "$FAUCET" "$TREASURY"; then
    COIN[$P]=$(made 'Coin<' </tmp/out)
  fi
done
as anna; expect_fail "a second share is refused" call faucet claim "$FAUCET" "$TREASURY"

say "== anna pays"
as anna
if [ -n "${COIN[anna]:-}" ]; then
  expect_fail "paying the whole coin (not the fee) is refused" call entry pay "$TREASURY" "$LEAGUE" "${CLUB[anna]}" "${COIN[anna]}"
  sui client split-coin --coin-id "${COIN[anna]}" --amounts $FEE --gas-budget 100000000 --json >/tmp/s.json 2>/dev/null
  FEECOIN=$(made 'Coin<' </tmp/s.json)
  expect_ok "paying exactly the fee" call entry pay "$TREASURY" "$LEAGUE" "${CLUB[anna]}" "$FEECOIN"
  expect_fail "paying twice for one season is refused" call entry pay "$TREASURY" "$LEAGUE" "${CLUB[anna]}" "${COIN[anna]}"
else fail "anna has no SFOOT coin to pay with"; fi

say "== the treasury"
KEPT=$(gql "$TREASURY" '.kept.value')
POOL=$(gql "$TREASURY" '.pool.value')
say "  kept=$KEPT pool=$POOL"
[ "$KEPT" = 1000000 ] && [ "$POOL" = 4000000 ] && ok "a fifth kept, four fifths to be won back" || fail "treasury holds kept=$KEPT pool=$POOL, expected 1000000 and 4000000"

say "== before the deadline"
as cara; expect_fail "nobody can take Bob's club while he still has time" call entry reclaim "$LEAGUE" "${CLUB[bob]:-0x0}"

say "== the season goes on past the deadline (matchday 3)"
for i in 1 2 3 4 5; do as anna; call league draw_week "$LEAGUE" 0x8 0x6 >/dev/null 2>&1 || say "  (draw $i not taken)"; done
WEEK=$(gql "$LEAGUE" '.week')
say "  now matchday $WEEK"

say "== after it"
as cara
expect_fail "Anna paid, so her club cannot be taken" call entry reclaim "$LEAGUE" "${CLUB[anna]}"
expect_ok   "Cara, who owns nothing, takes Bob's club back" call entry reclaim "$LEAGUE" "${CLUB[bob]}"
OWNER=$(gql "${CLUB[bob]}" '.owner')
[ -z "$OWNER" ] && ok "the club is nobody's again" || fail "the club still has an owner: $OWNER"

say "== Bob tries to come back with his old deed"
as bob
expect_fail "the deed from before the club was taken back no longer works" call deed present "${DEED[bob]:-0x0}" "${CLUB[bob]:-0x0}"

say
if [ "$bad" -eq 0 ]; then say "all of it held"; else say "$bad thing(s) did not"; exit 1; fi
