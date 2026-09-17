import * as dns from 'dns';

// On this machine Node's bundled c-ares resolver fails to read the Windows
// adapter DNS config and falls back to 127.0.0.1, where nothing is listening.
// That breaks dns.resolveSrv(), which the driver needs for mongodb+srv:// URIs
// (plain socket connects are unaffected — they use the OS resolver).
// Only override when the resolver is actually in that broken state.
export function ensureUsableDnsServers() {
  const servers = dns.getServers();
  const usable = servers.filter((s) => s !== '127.0.0.1' && s !== '::1');
  if (usable.length === 0) {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
  }
}
