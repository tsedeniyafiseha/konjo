import assert from 'node:assert/strict';

import { ADDRESS_QUERY_MAX_LENGTH, InvalidAddressQueryError, SearchAddresses } from '../src/application/search-addresses.ts';

// Short queries never reach the provider; bad input is rejected before it does.
let providerCalls = 0;
const search = new SearchAddresses({
  async search(query, limit) { providerCalls += 1; return [{ id: query, label: query, area: null, latitude: 0, longitude: 0 }].slice(0, limit); },
  async reverse() { providerCalls += 1; return null; },
});
assert.deepEqual(await search.search('  bo '), []);
assert.equal(providerCalls, 0);
assert.equal((await search.search('  bole   road  '))[0]?.label, 'bole road', 'whitespace is normalised');
await assert.rejects(search.search('x'.repeat(ADDRESS_QUERY_MAX_LENGTH + 1)), InvalidAddressQueryError);
await assert.rejects(search.reverse(Number.NaN, 38), InvalidAddressQueryError);
await assert.rejects(search.reverse(91, 38), InvalidAddressQueryError);
assert.equal(await search.reverse(9, 38.7), null);

console.log('Address search application contracts passed.');
