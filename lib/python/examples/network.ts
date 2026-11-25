// Built-in example: probes which addresses the current Network setting lets a program reach.
// The outside hosts were chosen because they send CORS headers (checked 2026-11-25 with curl):
// pypi.org and api.github.com send `Access-Control-Allow-Origin: *`, jsonplaceholder.typicode.com
// echoes the requesting origin.
import type { PythonExample } from './types';
import { pySource } from './types';

/** Hosts the probe contacts, in probe order (the harness and the Examples tab may show them). */
export const NETWORK_PROBE_HOSTS = ['pypi.org', 'api.github.com', 'jsonplaceholder.typicode.com'] as const;

export const networkProbeExample: PythonExample = {
  id: 'network_probe',
  tag: 'network',
  titleKey: 'python.example.network_probe.title',
  descriptionKey: 'python.example.network_probe.desc',
  entry: 'network_probe/main.py',
  files: {
    'network_probe/main.py': pySource(String.raw`
# Network access probe
# Shows: which addresses a program may reach under the current Network setting
# (Settings > Network; it changes only after a page reload, never from code).
#
#   1. this site itself               PASS in every mode
#   2. pypi.org (the package index)   PASS in "Package index" and "Everything"
#   3. api.github.com                 PASS in "Selected hosts" once you type
#                                     api.github.com into the host list, and in "Everything"
#   4. jsonplaceholder.typicode.com   PASS only in "Everything"
#
# The three outside hosts send CORS headers (Access-Control-Allow-Origin). A browser
# needs them before it lets a page read a reply from another site, so a host without
# them would show BLOCKED in every mode and the probe would prove nothing.
# A host that is down, or slower than 5 seconds, also shows BLOCKED.
#
# A script here runs synchronously, so the probe uses the browser's synchronous
# XMLHttpRequest (allowed in the worker Python runs in). It prints only the status.
import js

PROBES = [
    ("this site", "/python/main"),
    ("package index", "https://pypi.org/pypi/rich/json"),
    ("selected host", "https://api.github.com/zen"),
    ("other host", "https://jsonplaceholder.typicode.com/todos/1"),
]


def probe(url):
    xhr = js.XMLHttpRequest.new()
    try:
        xhr.open("GET", url, False)
        xhr.timeout = 5000
        xhr.send()
    except Exception:
        return False, "no reply"
    return 200 <= xhr.status < 300, f"HTTP {xhr.status}"


results = []
for label, url in PROBES:
    ok, detail = probe(url)
    results.append(ok)
    host = url.split("/")[2] if url.startswith("https://") else str(js.location.host)
    print(f"{'PASS' if ok else 'BLOCKED':<9}{label:<15}{host:<30}{detail}")

same, pypi, chosen, other = results
if not same:
    mode = "none (this site did not answer; reload the page and run again)"
elif not (pypi or chosen or other):
    mode = "Off"
elif pypi and not (chosen or other):
    mode = "Package index"
elif pypi and chosen and other:
    mode = "Everything"
elif not pypi:
    mode = "Selected hosts"
else:
    mode = "none (a host may be down or slow; run again)"
print(f"Results match network mode: {mode}")
`),
  },
};
