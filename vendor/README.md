# vendor

One file, and it is not ours: the part of the official Sui SDK that builds a transaction.

## Why it is here and not fetched

Building a transaction means BCS - a binary format where a wrong byte is not an error but a
different transaction. It is the one part of this project where writing it ourselves would be a bad
trade: nothing is gained and a whole class of silent, expensive mistakes is invited in.

So the official SDK does it. But it is served from our own domain rather than a CDN, because a page
that signs transactions should not load code from a third party it cannot see: whoever controls that
CDN on a bad day controls what gets signed. The page's Content-Security-Policy says `script-src
'self'`, which is what makes this a rule rather than a preference.

## What is in it

`@mysten/sui` version 3.0.1, bundled down to `Transaction`, `toBase64` and `fromBase64` - the
transaction builder and two conversions. No client, no keys, no faucet: the browser reads through
GraphQL and signs through the wallet, so none of the rest is wanted.

It puts them on `globalThis.SuiSDK` and nothing else.

## Making it again

    npm init -y && npm install @mysten/sui@3.0.1 esbuild

    cat > entry.js <<'EOF'
    import { Transaction } from '@mysten/sui/transactions';
    import { toBase64, fromBase64 } from '@mysten/sui/utils';
    globalThis.SuiSDK = { Transaction, toBase64, fromBase64 };
    EOF

    npx esbuild entry.js --bundle --format=iife --minify --target=es2020 --outfile=sui-3.0.1.js

Upgrading means doing this again with a new version and a new file name, so that a page can never
be served a bundle it was not built against.
