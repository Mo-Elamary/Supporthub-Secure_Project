const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

const blockedAddresses = new net.BlockList();

const blockedIpv4Ranges = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

const blockedIpv6Ranges = [
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
];

for (const [address, prefix] of blockedIpv4Ranges) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of blockedIpv6Ranges) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isBlockedAddress(address) {
  const family = net.isIP(address);

  if (family === 4) {
    return blockedAddresses.check(address, 'ipv4');
  }

  if (family === 6) {
    return blockedAddresses.check(address, 'ipv6');
  }

  return true;
}

async function validatePublicUrl(input) {
  let parsedUrl;

  try {
    parsedUrl = new URL(input);
  } catch {
    throw validationError('Invalid URL.');
  }

  if (
    parsedUrl.protocol !== 'http:' &&
    parsedUrl.protocol !== 'https:'
  ) {
    throw validationError(
      'Only HTTP and HTTPS URLs are allowed.'
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw validationError(
      'URLs containing credentials are not allowed.'
    );
  }

  const effectivePort =
    parsedUrl.port ||
    (parsedUrl.protocol === 'https:' ? '443' : '80');

  if (!['80', '443'].includes(effectivePort)) {
    throw validationError(
      'The requested URL port is not allowed.'
    );
  }

  const hostname = parsedUrl.hostname.replace(
    /^\[|\]$/g,
    ''
  );

  let addresses;

  try {
    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true
    });
  } catch {
    throw validationError(
      'The URL hostname could not be resolved.'
    );
  }

  if (!addresses.length) {
    throw validationError(
      'The URL hostname could not be resolved.'
    );
  }

  // Reject the hostname if any returned address belongs to a restricted
  // network. This prevents mixed public/private DNS responses.
  if (
    addresses.some((record) =>
      isBlockedAddress(record.address)
    )
  ) {
    throw validationError(
      'Private or restricted network addresses are not allowed.'
    );
  }

  const selectedAddress = addresses[0];

  return {
    url: parsedUrl.toString(),
    protocol: parsedUrl.protocol,
    address: selectedAddress.address,
    family: selectedAddress.family
  };
}

function createPinnedAgent(protocol, address, family) {
  const Agent =
    protocol === 'https:'
      ? https.Agent
      : http.Agent;

  return new Agent({
    keepAlive: false,

    // The connection uses the exact IP address that was checked above.
    // DNS is not resolved again between validation and connection.
    lookup(hostname, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      if (options?.all) {
        return callback(null, [
          {
            address,
            family
          }
        ]);
      }

      callback(null, address, family);
    }
  });
}

module.exports = {
  validatePublicUrl,
  createPinnedAgent,
  isBlockedAddress
};