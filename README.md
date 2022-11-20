# relayer-fees-js

uses Tendermint RPC endpoint to walk blocks, logs IBC client updates for each relayer (+ fees spent), outputs to .csv

- txs using fee-grant are assigned to the `granter` account 
- parses every relayer tx (including non-successful ones) to determine total cost of relayers

configure via config object:
```
vim app.js
```

to run:
```
npm install
npm run start
```