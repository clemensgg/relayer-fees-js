'use strict';

const config = {
    "chain": "osmosis-1",
    "rest": "http://localhost:1317",
    "output": "/home/ubuntu/output.csv",        // must be .csv
    "startBlock": 1,                            // must not be 0
    "maxBlocks": "inf"                          // "inf" to walk until latest block
}

const { Tx } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const { PubKey } = require('cosmjs-types/cosmos/crypto/secp256k1/keys');
const { pubkeyToAddress } = require('@cosmjs/amino');
const axios = require('axios');
const ObjectsToCsv = require('objects-to-csv')

async function getLastBlock() {
    try {
        var res = await axios.get(config.rest + '/blocks/latest');
    }
    catch (e) {
        console.log(e);
        return false;
    }
    return res.data.block.header.height;
}

async function blockwalker(maxblocks) {
    var results = [];
    var block = 0;
    var repeat = true;
    while (repeat) {
        var valid = true;
        if (block == 0) {
            block = config.startBlock;
            console.log(`-> Start block: ${block} - walking blocks...`);
        }
        try {
            var res = await axios.get(config.rest + '/blocks/' + block);
        }
        catch (e) {
            console.log(e);
            valid = false;
            console.log('waiting 5s to try again...');
            await new Promise(resolve => setTimeout(resolve, 5000));  // wait 5s if node kicks
        }
        if (valid) {
            block++;
            let txs = res.data.block.data.txs;
            let ibcCounter = 0;
            txs.forEach((tx) => {
                var isIbcTx = false;
                let buff = Buffer.from(tx, 'base64');
                let msgs = Tx.decode(buff).body.messages;
                msgs.forEach((msg) => {
                    if (msg.typeUrl.includes('/ibc') && msg.typeUrl != "/ibc.applications.transfer.v1.MsgTransfer") {
                        isIbcTx = true
                    }
                });
                if (isIbcTx) {
                    results.push(Tx.decode(buff));
                    ibcCounter++;
                }
            });
            if (ibcCounter != 0) {
                console.log(`block ${block} logged txs: ${ibcCounter}`);
            }
        }
        if (block >= (config.startBlock + maxblocks)) {
            repeat = false;
        }
    }
    return results
}

function calculateFeeTotals(data) {
    data.forEach((relayer) => {
        var totalFees = []
        relayer.txs.forEach((tx) => {
            var feeamounts = tx.authInfo.fee.amount;
            var valid = false;
            feeamounts.forEach((fee) => {
                for (var i = 0; i < totalFees.length; i++) {
                    if (fee.denom == totalFees[i].denom) {
                        totalFees[i].amount = parseInt(totalFees[i].amount) + parseInt(fee.amount);
                        valid = true;
                    }
                }
                if (valid == false) {
                    totalFees.push(fee);
                }
            });
        });
        relayer.total_fees = totalFees;
    });
    return data;
}

function sortRelayTxs(txs) {
    var results = [];
    txs.forEach((tx) => {
        if (tx.authInfo.fee.granter == "") {
            let key = PubKey.toJSON(PubKey.decode(tx.authInfo.signerInfos[0].publicKey.value)).key.toString();
            let pubkey = {
                "type": "tendermint/PubKeySecp256k1",
                "value": key
            }
            let address = pubkeyToAddress(pubkey, "osmo");

            var indb = false;
            for (var i = 0; i < results.length; i++) {
                if (results[i].address == address) {
                    results[i].txs.push(tx);
                    indb = true;
                }
            }
            if (indb == false) {
                results.push({
                    "address": address,
                    "txs": [tx]
                });
            }
        }
    });
    return results;
}

async function main() {
    var maxblocks = config.maxBlocks;
    if (maxblocks == 'inf') {
        var latest = await getLastBlock();
        maxblocks = latest - config.startBlock;
    }
    var txs = await blockwalker(maxblocks);
    var data = sortRelayTxs(txs);
    data = calculateFeeTotals(data);

    data.forEach((relayer) => {
        console.log(relayer.address);
        relayer.total_fees.forEach((fee) => {
            console.log(`denom: ${fee.denom} amount ${fee.amount}`);
        });
        delete relayer.txs;
    });



    const csv = new ObjectsToCsv(data)
    await csv.toDisk(config.output);

    console.log("done");
}

main();