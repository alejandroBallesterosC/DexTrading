// adapted from https://github.com/blockworks-foundation/mango-client-v3/blob/main/examples/example.ts
import * as os from 'os';
import * as fs from 'fs';
import {
  Config,
  getMarketByBaseSymbolAndKind,
  getUnixTs,
  GroupConfig,
  MangoClient,
  ZERO_BN,
} from '@blockworks-foundation/mango-client';
import { Keypair, Commitment, Connection } from '@solana/web3.js';
import { Market } from '@project-serum/serum';

// TODO: seems like this would be better if not hard-coded
// but maybe serum dexes need it
import configFile from './config.json';

const readKeypair = () => {
  return JSON.parse(
    process.env.KEYPAIR ||
      fs.readFileSync(os.homedir() + '/.config/solana/arb/mango.json', 'utf-8'),
  );
}

const setupClient = () => {
  const config = new Config(configFile);
  const groupConfig = config.getGroupWithName('devnet.2') as GroupConfig;
  // const groupConfig = config.getGroup(
  //   'devnet',
  //   'mango_test_v2.2'
  // ) as GroupConfig;
  const connection = new Connection(
    config.cluster_urls[groupConfig.cluster],
    'processed' as Commitment,
  );
  const client = new MangoClient(connection, groupConfig.mangoProgramId);

  return { groupConfig, connection, client };
};

async function examplePerp() {
  const { groupConfig, connection, client } = setupClient();

  // load group & market
  const perpMarketConfig = getMarketByBaseSymbolAndKind(
    groupConfig,
    'BTC',
    'perp',
  );
  const mangoGroup = await client.getMangoGroup(groupConfig.publicKey);
  const perpMarket = await mangoGroup.loadPerpMarket(
    connection,
    perpMarketConfig.marketIndex,
    perpMarketConfig.baseDecimals,
    perpMarketConfig.quoteDecimals,
  );

  // Fetch orderbooks
  const bids = await perpMarket.loadBids(connection);
  const asks = await perpMarket.loadAsks(connection);

  // L2 orderbook data
  for (const [price, size] of bids.getL2(20)) {
    console.log(price, size);
  }

  // L3 orderbook data
  for (const order of asks) {
    console.log(
      order.owner.toBase58(),
      order.orderId.toString('hex'),
      order.price,
      order.size,
      order.side, // 'buy' or 'sell'
    );
  }

  // Place order
  const owner = new Keypair(readKeypair());
  const mangoAccount = (
    await client.getMangoAccountsForOwner(mangoGroup, owner.publicKey)
  )[0];

  // Place an order that is guaranteed to go on the book and let it auto expire in 5 seconds
  await client.placePerpOrder2(
    mangoGroup,
    mangoAccount,
    perpMarket,
    owner,
    'buy', // or 'sell'
    39000,
    0.0001,
    { orderType: 'postOnlySlide', expiryTimestamp: getUnixTs() + 5 },
  ); // or 'ioc' or 'postOnly'

  // retrieve open orders for account
  const openOrders = await perpMarket.loadOrdersForAccount(
    connection,
    mangoAccount,
  );

  // cancel orders
  for (const order of openOrders) {
    await client.cancelPerpOrder(
      mangoGroup,
      mangoAccount,
      owner,
      perpMarket,
      order,
    );
  }

  // Retrieve fills
  for (const fill of await perpMarket.loadFills(connection)) {
    console.log(
      fill.maker.toBase58(),
      fill.taker.toBase58(),
      fill.price,
      fill.quantity,
    );
  }
}

async function exampleSpot() {
  const { groupConfig, connection, client } = setupClient();

  // load group & market
  const spotMarketConfig = getMarketByBaseSymbolAndKind(
    groupConfig,
    'BTC',
    'spot',
  );
  const mangoGroup = await client.getMangoGroup(groupConfig.publicKey);
  const spotMarket = await Market.load(
    connection,
    spotMarketConfig.publicKey,
    undefined,
    groupConfig.serumProgramId,
  );

  // Fetch orderbooks
  let bids = await spotMarket.loadBids(connection);
  let asks = await spotMarket.loadAsks(connection);

  // L2 orderbook data
  for (const [price, size] of bids.getL2(20)) {
    console.log(price, size);
  }

  // L3 orderbook data
  for (const order of asks) {
    console.log(
      order.openOrdersAddress.toBase58(),
      order.orderId.toString('hex'),
      order.price,
      order.size,
      order.side, // 'buy' or 'sell'
    );
  }

  // Place order
  const owner = readKeypair();
  const mangoAccount = (
    await client.getMangoAccountsForOwner(mangoGroup, owner.publicKey)
  )[0];

  await client.placeSpotOrder2(
    mangoGroup,
    mangoAccount,
    spotMarket,
    owner,
    'buy', // or 'sell'
    41000,
    0.0001,
    'limit',
    ZERO_BN, // client order id, set to whatever you want
    true, // use the mango MSRM vault for fee discount
  ); // or 'ioc' or 'postOnly'

  // Reload bids and asks and find your open orders
  // Possibly have a wait here so RPC node can catch up
  const openOrders = await mangoAccount.loadSpotOrdersForMarket(
    connection,
    spotMarket,
    spotMarketConfig.marketIndex,
  );

  // cancel orders
  for (const order of openOrders) {
    await client.cancelSpotOrder(
      mangoGroup,
      mangoAccount,
      owner,
      spotMarket,
      order,
    );
  }

  // Retrieve fills
  for (const fill of await spotMarket.loadFills(connection)) {
    console.log(
      fill.openOrders.toBase58(),
      fill.eventFlags.maker ? 'maker' : 'taker',
      fill.size * (fill.side === 'buy' ? 1 : -1),
      spotMarket.quoteSplSizeToNumber(
        fill.side === 'buy'
          ? fill.nativeQuantityPaid
          : fill.nativeQuantityReleased,
      ),
    );
  }

  // Settle funds
  for (const openOrders of await mangoAccount.loadOpenOrders(
    connection,
    groupConfig.serumProgramId,
  )) {
    if (!openOrders) continue;

    if (
      openOrders.baseTokenFree.gt(ZERO_BN) ||
      openOrders.quoteTokenFree.gt(ZERO_BN)
    ) {
      await client.settleFunds(mangoGroup, mangoAccount, owner, spotMarket);
    }
  }
}

const printRootBanks = async () => {
  // look up token index by mint public key
  mangoGroup.getTokenIndex(token: PublicKey): number 

  // fetch total deposits/borrows, deposit and borrow interest rates, as well as percent utilization of each token in the group
  const rootBanks = await mangoGroup.loadRootBanks(connection);
  const tokensInfo = groupConfig.tokens.map((token) => {
    const rootBank = rootBanks.find((bank) => {
      if (!bank) {
        return false;
      }
      return bank.publicKey.toBase58() == token.rootKey.toBase58();
    });

    if (!rootBank) {
      throw new Error("rootBanks is undefined");
    }
    return {
      name: token.symbol,
      totalDeposits: totalDeposits.toFixed(
          tokenPrecision[token.symbol] || 2
        ),
        totalBorrows: totalBorrows.toFixed(
          tokenPrecision[token.symbol] || 2
        ),
      depositRate: rootBank
        .getDepositRate(mangoGroup)
        .mul(I80F48.fromNumber(100)),
      borrowRate: rootBank
        .getBorrowRate(mangoGroup)
        .mul(I80F48.fromNumber(100)),
        utilization: totalDeposits.gt(I80F48.fromNumber(0))
          ? totalBorrows.div(totalDeposits)
          : I80F48.fromNumber(0),
    };
  });
};

const testFn = async () => {
  const { groupConfig, connection, client } = setupClient();
  const mangoGroup = await client.getMangoGroup(groupConfig.publicKey);
  const owner = readKeypair();
  const rootBanks = await mangoGroup.loadRootBanks(connection);
  console.log(rootBanks);

  // client.createMangoAccountAndDeposit(mangoGroup, owner, rootBank: PublicKey, nodeBank: PublicKey, vault: PublicKey, tokenAcc: PublicKey, quantity: number, accountNum: number, info?: string): Promise<[string, string]>

  // const mangoAccount = (
  //   await client.getMangoAccountsForOwner(mangoGroup, owner.publicKey)
  // )[0];
};

// examplePerp();
// exampleSpot();
testFn();