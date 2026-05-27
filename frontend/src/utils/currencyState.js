const currencyState = {
  currency: 'GHS',
  ghsToUsd: null,
};

export const getCurrencyState = () => currencyState;

export const setCurrencyState = (nextState) => {
  if (!nextState || typeof nextState !== 'object') return;
  if (nextState.currency) currencyState.currency = nextState.currency;
  if (Object.prototype.hasOwnProperty.call(nextState, 'ghsToUsd')) {
    currencyState.ghsToUsd = nextState.ghsToUsd;
  }
};