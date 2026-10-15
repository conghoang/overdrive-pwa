/*
 * phone/lock.js: the lock aggregate of the phone (owner 2026-10-13, E:\OverDrive\ui-concepts\handoff-home-v2 B3;
 * reference home-v2.html 233-242), one rule for Home's chip, summary line, Lock button and cards (views/home.js) and
 * for the 3D car. The car's Home (web/shared/od/car/home.js:61-84) but for the last rule:
 * - the driver's door is lf, rf when meta.driveSide is 'rhd'; its value is lock.driver (the car's own sensor) when the
 *   car reports it, else the BYD Cloud snapshot's;
 * - the other three doors are known only from lock.doors.* while lock.scope is 'all' (a fresh BYD Cloud snapshot);
 * - "locked" only when all four doors are known locked; "unlocked" as soon as one door is known unlocked; anything
 *   else is unknown (null): never a guess. Without BYD Cloud (lock.scope not 'all') the driver's door stands for the
 *   car (owner 2026-10-13: "Da khoa (theo cua tai)", byDriver).
 * read(key) is a store getter (od.store.get, or what the 3D car shows). No DOM, nothing sent.
 */
export const DOORS = ['lf', 'rf', 'lr', 'rr'];

/** The driver's door key. */
export const driverDoor = (read) => (read('meta.driveSide') === 'rhd' ? 'rf' : 'lf');

/**
 * {state: true | false | null, open: unlocked door keys, driver: what is known of the driver's door, byDriver: the
 * state is the driver's door's}.
 */
export function lockAgg(read) {
  const drv = driverDoor(read);
  const all = read('lock.scope') === 'all';
  const sensor = read('lock.driver');
  const known = sensor === true || sensor === false;
  const val = (k) => {
    if (k === drv && known) return sensor;
    // rhd: lock.doors.lf is the sensor while known (VehicleStateSampler.putLock), not the cloud's lf.
    if (k === 'lf' && drv !== 'lf' && known) return null;
    const x = all ? read(`lock.doors.${k}`) : null;
    return x === true || x === false ? x : null;
  };
  const vals = DOORS.map(val);
  const open = DOORS.filter((k, i) => vals[i] === false);
  const driver = vals[DOORS.indexOf(drv)];
  const state = open.length ? false : vals.every((x) => x === true) || (!all && driver === true) ? true : null;
  return { state, open, driver, byDriver: !all };
}
