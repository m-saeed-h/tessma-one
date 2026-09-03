// AP-08 "one way to do a thing": every controller returning a BigInt (pence)
// field goes through this, not its own inline JSON.stringify replacer.
export function serialise<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
